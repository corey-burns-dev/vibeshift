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

// VideoChatHub manages WebRTC signaling for peer-to-peer video chat rooms.
// It does NOT touch media — it only relays SDP offers/answers and ICE candidates.
type VideoChatHub struct {
	mu sync.RWMutex

	// rooms maps roomID -> userID -> client
	rooms map[string]map[uint]*Client
}

// Name returns a human-readable identifier for this hub.
func (h *VideoChatHub) Name() string { return "video chat hub" }

// NewVideoChatHub creates a new VideoChatHub
func NewVideoChatHub() *VideoChatHub {
	return &VideoChatHub{
		rooms: make(map[string]map[uint]*Client),
	}
}

// Join is a legacy wrapper for Register.
func (h *VideoChatHub) Join(roomID string, userID uint, username string, conn *websocket.Conn) {
	if _, err := h.Register(roomID, userID, conn); err != nil {
		log.Printf("VideoChatHub: Failed to join room %s for user %d: %v", roomID, userID, err)
		return
	}
	h.BroadcastJoin(roomID, userID, username)
}

// BroadcastJoin notifies existing peers of a new joiner and sends existing peer list to the joiner.
func (h *VideoChatHub) BroadcastJoin(roomID string, userID uint, username string) {
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	if !ok {
		h.mu.RUnlock()
		return
	}

	// Prepare list of existing users for the new joiner
	existingUsers := make([]map[string]any, 0, len(room))
	for uid := range room {
		if uid == userID {
			continue
		}
		// We don't store username in Client currently, so this might be limited
		// but we can at least send userIDs.
		existingUsers = append(existingUsers, map[string]any{
			"userId": uid,
			// username is not stored in hub/client, so we'll have to rely on IDs or update storage
		})
	}
	newJoiner := room[userID]
	h.mu.RUnlock()

	// 1. Tell new joiner who is already there
	if newJoiner != nil {
		roomUsersMsg := VideoChatSignal{
			Type:   "room_users",
			RoomID: roomID,
			Payload: map[string]any{
				"users": existingUsers,
			},
		}
		if msgJSON, err := json.Marshal(roomUsersMsg); err == nil {
			newJoiner.TrySend(msgJSON)
		}
	}

	// 2. Tell others that someone new joined
	joinMsg := VideoChatSignal{
		Type:     "user_joined",
		RoomID:   roomID,
		UserID:   userID,
		Username: username,
	}
	h.broadcastToRoom(roomID, userID, joinMsg)
}

// Register adds a user to a video chat room. Returns Client or error if limits exceeded.
func (h *VideoChatHub) Register(roomID string, userID uint, conn *websocket.Conn) (*Client, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Enforce room count limit
	if h.rooms[roomID] == nil && len(h.rooms) >= MaxTotalRooms {
		return nil, fmt.Errorf("too many active rooms")
	}

	if h.rooms[roomID] == nil {
		h.rooms[roomID] = make(map[uint]*Client)
	}

	// Enforce per-room peer limit
	if len(h.rooms[roomID]) >= MaxPeersPerRoom {
		return nil, fmt.Errorf("room is full")
	}

	client := NewClient(h, conn, userID)
	h.rooms[roomID][userID] = client

	return client, nil
}

// UnregisterClient removes a user from a video chat room
func (h *VideoChatHub) UnregisterClient(client *Client) {
	h.mu.Lock()

	var targetRoomID string
	found := false
	for roomID, peers := range h.rooms {
		if c, ok := peers[client.UserID]; ok {
			// Only remove if the registered client matches this client instance.
			if c != client {
				// Another active client is registered for this user in the room; skip.
				continue
			}
			targetRoomID = roomID
			delete(peers, client.UserID)
			if len(peers) == 0 {
				delete(h.rooms, roomID)
			}
			found = true
			break
		}
	}
	h.mu.Unlock()

	if found {
		log.Printf("VideoChatHub: User %d left room %s", client.UserID, targetRoomID)
		// Notify remaining peers
		leaveMsg := VideoChatSignal{
			Type:   "user_left",
			RoomID: targetRoomID,
			UserID: client.UserID,
		}
		h.broadcastToRoom(targetRoomID, client.UserID, leaveMsg)
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

	signal.UserID = fromUserID
	msgJSON, err := json.Marshal(signal)
	if err != nil {
		return
	}

	target.TrySend(msgJSON)
}

// broadcastToRoom sends a message to all peers in a room except the sender
func (h *VideoChatHub) broadcastToRoom(roomID string, excludeUserID uint, signal VideoChatSignal) {
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	if !ok {
		h.mu.RUnlock()
		return
	}

	targets := make([]*Client, 0, len(room))
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
		peer.TrySend(msgJSON)
	}
}

// StartWiring connects VideoChatHub to Redis pub/sub
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
				peer.TrySend(msgJSON)
			}
			_ = peer.Conn.Close()
		}
	}

	h.rooms = make(map[string]map[uint]*Client)
	return nil
}
