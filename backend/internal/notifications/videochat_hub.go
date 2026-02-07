package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/gofiber/websocket/v2"
)

const (
	// MaxPeersPerRoom prevents unbounded room growth
	MaxPeersPerRoom = 10
	// MaxTotalRooms prevents unbounded map growth
	MaxTotalRooms = 1000
)

// VideoChatSignal represents a WebRTC signaling message relayed through the hub
type VideoChatSignal struct {
	Type     string      `json:"type"`                // "join", "leave", "offer", "answer", "ice-candidate", "room_users", "user_joined", "user_left", "error"
	RoomID   string      `json:"room_id,omitempty"`   // Room identifier (string-based for flexibility)
	UserID   uint        `json:"user_id,omitempty"`   // Sender
	TargetID uint        `json:"target_id,omitempty"` // Intended recipient (for offer/answer/ice)
	Username string      `json:"username,omitempty"`
	Payload  interface{} `json:"payload,omitempty"` // SDP or ICE candidate data
}

// videoChatPeer tracks a single user's connection in a video chat room
type videoChatPeer struct {
	UserID   uint
	Username string
	Conn     *websocket.Conn
	writeMu  sync.Mutex // protects concurrent writes to Conn
}

// safeWrite sends a message to the peer with mutex protection
func (p *videoChatPeer) safeWrite(msgType int, data []byte) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	return p.Conn.WriteMessage(msgType, data)
}

// VideoChatHub manages WebRTC signaling for peer-to-peer video chat rooms.
// It does NOT touch media — it only relays SDP offers/answers and ICE candidates.
type VideoChatHub struct {
	mu sync.RWMutex

	// rooms maps roomID -> userID -> peer
	rooms map[string]map[uint]*videoChatPeer
}

// NewVideoChatHub creates a new VideoChatHub
func NewVideoChatHub() *VideoChatHub {
	return &VideoChatHub{
		rooms: make(map[string]map[uint]*videoChatPeer),
	}
}

// Join adds a user to a video chat room, notifies existing peers, and sends the room user list
func (h *VideoChatHub) Join(roomID string, userID uint, username string, conn *websocket.Conn) {
	peer := &videoChatPeer{
		UserID:   userID,
		Username: username,
		Conn:     conn,
	}

	h.mu.Lock()

	// Enforce room count limit
	if h.rooms[roomID] == nil && len(h.rooms) >= MaxTotalRooms {
		h.mu.Unlock()
		errMsg, _ := json.Marshal(VideoChatSignal{Type: "error", Payload: map[string]string{"message": "too many active rooms"}})
		_ = peer.safeWrite(websocket.TextMessage, errMsg)
		return
	}

	if h.rooms[roomID] == nil {
		h.rooms[roomID] = make(map[uint]*videoChatPeer)
	}

	// Enforce per-room peer limit
	if len(h.rooms[roomID]) >= MaxPeersPerRoom {
		h.mu.Unlock()
		errMsg, _ := json.Marshal(VideoChatSignal{Type: "error", Payload: map[string]string{"message": "room is full"}})
		_ = peer.safeWrite(websocket.TextMessage, errMsg)
		return
	}

	// Collect existing peers before adding the new one
	existingPeers := make([]map[string]interface{}, 0, len(h.rooms[roomID]))
	existingConns := make([]*videoChatPeer, 0, len(h.rooms[roomID]))
	for _, p := range h.rooms[roomID] {
		existingPeers = append(existingPeers, map[string]interface{}{
			"user_id":  p.UserID,
			"username": p.Username,
		})
		existingConns = append(existingConns, p)
	}

	// Register the new peer
	h.rooms[roomID][userID] = peer

	h.mu.Unlock()

	log.Printf("VideoChatHub: User %d (%s) joined room %s (%d peers)", userID, username, roomID, len(existingPeers)+1)

	// Send room_users to the joining peer so they know who to call
	roomUsersMsg := VideoChatSignal{
		Type:   "room_users",
		RoomID: roomID,
		Payload: map[string]interface{}{
			"users": existingPeers,
		},
	}
	if msgJSON, err := json.Marshal(roomUsersMsg); err == nil {
		_ = peer.safeWrite(websocket.TextMessage, msgJSON)
	}

	// Notify existing peers that someone joined (using collected refs, no lock needed)
	joinMsg := VideoChatSignal{
		Type:     "user_joined",
		RoomID:   roomID,
		UserID:   userID,
		Username: username,
	}
	if msgJSON, err := json.Marshal(joinMsg); err == nil {
		for _, p := range existingConns {
			if err := p.safeWrite(websocket.TextMessage, msgJSON); err != nil {
				log.Printf("VideoChatHub: Write error to user %d in room %s: %v", p.UserID, roomID, err)
			}
		}
	}
}

// Leave removes a user from a video chat room and notifies remaining peers
func (h *VideoChatHub) Leave(roomID string, userID uint) {
	h.mu.Lock()

	room, ok := h.rooms[roomID]
	if !ok {
		h.mu.Unlock()
		return
	}

	delete(room, userID)
	if len(room) == 0 {
		delete(h.rooms, roomID)
	}

	h.mu.Unlock()

	log.Printf("VideoChatHub: User %d left room %s", userID, roomID)

	// Notify remaining peers
	leaveMsg := VideoChatSignal{
		Type:   "user_left",
		RoomID: roomID,
		UserID: userID,
	}
	h.broadcastToRoom(roomID, userID, leaveMsg)
}

// Relay forwards a signaling message (offer/answer/ice-candidate) to a specific target peer
func (h *VideoChatHub) Relay(roomID string, fromUserID, targetID uint, signal VideoChatSignal) {
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	target, ok := room[targetID]
	h.mu.RUnlock()

	if !ok {
		log.Printf("VideoChatHub: Target user %d not found in room %s", targetID, roomID)
		return
	}

	// Stamp the sender ID so the recipient knows who it's from
	signal.UserID = fromUserID

	msgJSON, err := json.Marshal(signal)
	if err != nil {
		return
	}

	if err := target.safeWrite(websocket.TextMessage, msgJSON); err != nil {
		log.Printf("VideoChatHub: Failed to relay signal to user %d in room %s: %v", targetID, roomID, err)
	}
}

// broadcastToRoom sends a message to all peers in a room except the sender
func (h *VideoChatHub) broadcastToRoom(roomID string, excludeUserID uint, signal VideoChatSignal) {
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	if !ok {
		h.mu.RUnlock()
		return
	}

	// Collect peers under read lock, then send outside the lock
	targets := make([]*videoChatPeer, 0, len(room))
	for uid, peer := range room {
		if uid == excludeUserID {
			continue
		}
		targets = append(targets, peer)
	}
	h.mu.RUnlock()

	msgJSON, err := json.Marshal(signal)
	if err != nil {
		return
	}

	for _, peer := range targets {
		if err := peer.safeWrite(websocket.TextMessage, msgJSON); err != nil {
			log.Printf("VideoChatHub: Write error to user %d in room %s: %v", peer.UserID, roomID, err)
		}
	}
}

// StartWiring connects VideoChatHub to Redis pub/sub for multi-instance support
func (h *VideoChatHub) StartWiring(ctx context.Context, n *Notifier) error {
	return n.StartVideoChatSubscriber(ctx, func(channel, payload string) {
		var roomID string
		if _, err := fmt.Sscanf(channel, "videochat:room:%s", &roomID); err != nil {
			return
		}

		var signal VideoChatSignal
		if err := json.Unmarshal([]byte(payload), &signal); err != nil {
			return
		}
		signal.RoomID = roomID

		// If targeted, relay to specific user; otherwise broadcast
		if signal.TargetID != 0 {
			h.Relay(roomID, signal.UserID, signal.TargetID, signal)
		} else {
			h.broadcastToRoom(roomID, signal.UserID, signal)
		}
	})
}

// Shutdown gracefully closes all video chat connections
func (h *VideoChatHub) Shutdown(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	for roomID, users := range h.rooms {
		for _, peer := range users {
			shutdownMsg := VideoChatSignal{
				Type:   "server_shutdown",
				RoomID: roomID,
			}
			if msgJSON, err := json.Marshal(shutdownMsg); err == nil {
				// Best-effort write — connection may already be closed
				_ = peer.safeWrite(websocket.TextMessage, msgJSON)
			}
			_ = peer.Conn.Close()
		}
	}

	h.rooms = make(map[string]map[uint]*videoChatPeer)
	return nil
}
