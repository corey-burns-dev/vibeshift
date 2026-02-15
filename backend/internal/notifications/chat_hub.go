// Package notifications provides real-time notification delivery and management.
package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/gofiber/websocket/v2"
	"github.com/redis/go-redis/v9"
)

// ChatHub manages WebSocket connections for chat conversations.
// Unlike Hub (which is user-centric), ChatHub is conversation-centric.
type ChatHub struct {
	mu sync.RWMutex

	// Map: conversationID -> userID -> Client
	conversations map[uint]map[uint]*Client

	// Map: userID -> set of conversationIDs they're actively viewing
	userActiveConvs map[uint]map[uint]struct{}

	// Map: userID -> set of active Clients (Multi-Device Support)
	userConns map[uint]map[*Client]bool

	presence *ConnectionManager
}

// Name returns a human-readable identifier for this hub.
func (h *ChatHub) Name() string { return "chat hub" }

// ChatMessage represents a message broadcast to a conversation
type ChatMessage struct {
	Type           string      `json:"type"` // "message", "typing", "presence", "read", "room_message", "user_status", "connected_users"
	ConversationID uint        `json:"conversation_id"`
	RoomID         uint        `json:"room_id,omitempty"`
	UserID         uint        `json:"user_id,omitempty"`
	Username       string      `json:"username,omitempty"`
	Payload        interface{} `json:"payload"`
}

// NewChatHub creates a new ChatHub instance
func NewChatHub(redisClients ...*redis.Client) *ChatHub {
	var redisClient *redis.Client
	if len(redisClients) > 0 {
		redisClient = redisClients[0]
	}

	h := &ChatHub{
		conversations:   make(map[uint]map[uint]*Client),
		userActiveConvs: make(map[uint]map[uint]struct{}),
		userConns:       make(map[uint]map[*Client]bool),
		presence:        NewConnectionManager(redisClient, ConnectionManagerConfig{}),
	}
	if h.presence != nil {
		// Register internal handlers as listeners to the manager so multiple
		// hubs can share the same ConnectionManager without clobbering callbacks.
		h.presence.AddListener(
			func(userID uint) { h.handleUserOnline(userID) },
			func(userID uint) { h.handleUserOffline(userID) },
		)
	}
	return h
}

// SetPresenceManager replaces the chat hub's ConnectionManager and registers
// the hub's internal handlers with it. If a previous manager existed it will
// be stopped.
func (h *ChatHub) SetPresenceManager(m *ConnectionManager) {
	if m == nil {
		return
	}
	h.mu.Lock()
	old := h.presence
	h.presence = m
	h.mu.Unlock()
	if old != nil && old != m {
		old.Stop()
	}
	// Register the hub's own handlers as listeners on the shared manager.
	m.AddListener(func(userID uint) { h.handleUserOnline(userID) }, func(userID uint) { h.handleUserOffline(userID) })
}

// Register registers a user's websocket connection. Returns Client or error if limits exceeded.
func (h *ChatHub) Register(userID uint, conn *websocket.Conn) (*Client, error) {
	h.mu.Lock()

	// Initialize user connection set if needed
	if h.userConns[userID] == nil {
		h.userConns[userID] = make(map[*Client]bool)
	}

	// Enforce per-user limit
	if len(h.userConns[userID]) >= maxConnsPerUser {
		h.mu.Unlock()
		return nil, fmt.Errorf("user connection limit reached")
	}

	// Create new client
	client := NewClient(h, conn, userID)
	client.OnActivity = func(uid uint) {
		if h.presence != nil {
			h.presence.Touch(context.Background(), uid)
		}
	}
	h.userConns[userID][client] = true
	activeClientCount := len(h.userConns[userID])
	h.mu.Unlock()

	if h.presence != nil {
		h.presence.Register(context.Background(), userID)
	}

	onlineIDs := h.onlineUsersSnapshot(userID)

	log.Printf("ChatHub: Registered user %d (Active clients: %d)", userID, activeClientCount)

	// Send initial snapshot
	if len(onlineIDs) > 0 {
		snapshotMsg := ChatMessage{
			Type:    "connected_users",
			Payload: map[string]interface{}{"user_ids": onlineIDs},
		}
		if jsonMsg, err := json.Marshal(snapshotMsg); err == nil {
			client.TrySend(jsonMsg)
		}
	}

	return client, nil
}

// RegisterUser is a legacy wrapper for Register. Deprecated: use Register instead.
func (h *ChatHub) RegisterUser(client *Client) {
	h.mu.Lock()
	if h.userConns[client.UserID] == nil {
		h.userConns[client.UserID] = make(map[*Client]bool)
	}
	h.userConns[client.UserID][client] = true
	client.OnActivity = func(uid uint) {
		if h.presence != nil {
			h.presence.Touch(context.Background(), uid)
		}
	}
	h.mu.Unlock()
	if h.presence != nil {
		h.presence.Register(context.Background(), client.UserID)
		return
	}
	h.BroadcastGlobalStatus(client.UserID, "online")
}

// UnregisterUser is a legacy wrapper for UnregisterClient.
func (h *ChatHub) UnregisterUser(client *Client) {
	h.UnregisterClient(client)
}

// UnregisterClient removes a user's websocket connection and cleans up all their conversation subscriptions
func (h *ChatHub) UnregisterClient(client *Client) {
	h.mu.Lock()
	clients, ok := h.userConns[client.UserID]
	if !ok {
		h.mu.Unlock()
		return
	}
	if _, exists := clients[client]; !exists {
		h.mu.Unlock()
		return
	}

	delete(clients, client)
	remaining := len(clients)
	if remaining == 0 {
		delete(h.userConns, client.UserID)
	}
	hasPresence := h.presence != nil
	h.mu.Unlock()

	if hasPresence {
		h.presence.Unregister(context.Background(), client.UserID)
		if remaining > 0 {
			log.Printf("ChatHub: Unregistered client for user %d (Remaining clients: %d)", client.UserID, remaining)
			return
		}
		log.Printf("ChatHub: Unregistered user %d (offline grace started)", client.UserID)
		return
	}

	if remaining > 0 {
		log.Printf("ChatHub: Unregistered client for user %d (Remaining clients: %d)", client.UserID, remaining)
		return
	}

	// Remove from all conversations
	h.mu.Lock()
	if convs, ok := h.userActiveConvs[client.UserID]; ok {
		for convID := range convs {
			if users, ok := h.conversations[convID]; ok {
				delete(users, client.UserID)
				if len(users) == 0 {
					delete(h.conversations, convID)
				}
			}
		}
		delete(h.userActiveConvs, client.UserID)
	}
	h.mu.Unlock()

	log.Printf("ChatHub: Unregistered user %d (All connections closed)", client.UserID)

	// Broadcast "User X is Offline" to everyone else
	h.BroadcastGlobalStatus(client.UserID, "offline")
}

// IsUserOnline returns true when the user has at least one active chat websocket client.
func (h *ChatHub) IsUserOnline(userID uint) bool {
	if h.presence != nil {
		return h.presence.IsOnline(context.Background(), userID)
	}
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients, ok := h.userConns[userID]
	return ok && len(clients) > 0
}

// JoinConversation subscribes a user to a conversation's messages
func (h *ChatHub) JoinConversation(userID, conversationID uint) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Get user's client
	// Get user's client set
	clients, ok := h.userConns[userID]
	if !ok {
		log.Printf("ChatHub: User %d not connected, cannot join conversation %d", userID, conversationID)
		return
	}

	// Add to conversation map (Just simple user presence in room)
	if h.conversations[conversationID] == nil {
		h.conversations[conversationID] = make(map[uint]*Client) // Note: Map value type *Client is legacy, we actually just need boolean presence here
		// But changing `conversations` map type requires more refactoring.
		// For now, we store nil or just any client. It doesn't matter because BroadcastToConversation should iterate userConns.
		// Wait, BroadcastToConversation uses `users := h.conversations[conversationID]`.
		// It iterates `for _, client := range users`.
		// This OLD logic assumes 1 Client per User.
		// We need to FIX `BroadcastToConversation` too.
		// For now, let's keep the map type but ignore the value in new logic.
	}
	// We just mark presence:
	// We just mark presence:
	// We need to provide a single *Client to satisfy the map type for now.
	// Since BroadcastToConversation ignores this value (it uses userConns), any valid client works.
	var anyClient *Client
	for c := range clients {
		anyClient = c
		break
	}
	h.conversations[conversationID][userID] = anyClient

	// Track active conversation for user
	if h.userActiveConvs[userID] == nil {
		h.userActiveConvs[userID] = make(map[uint]struct{})
	}
	h.userActiveConvs[userID][conversationID] = struct{}{}

	log.Printf("ChatHub: User %d joined conversation %d", userID, conversationID)
}

// LeaveConversation unsubscribes a user from a conversation
func (h *ChatHub) LeaveConversation(userID, conversationID uint) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Remove from conversation
	if users, ok := h.conversations[conversationID]; ok {
		delete(users, userID)
		if len(users) == 0 {
			delete(h.conversations, conversationID)
		}
	}

	// Remove from user's active conversations
	if convs, ok := h.userActiveConvs[userID]; ok {
		delete(convs, conversationID)
	}

	log.Printf("ChatHub: User %d left conversation %d", userID, conversationID)
}

// BroadcastToConversation sends a message to all users in a conversation
func (h *ChatHub) BroadcastToConversation(conversationID uint, message ChatMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users, ok := h.conversations[conversationID]
	if !ok {
		// Expected when no users are actively viewing this conversation.
		// Messages for DMs are still delivered via the notification hub.
		return
	}

	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Printf("ChatHub: Failed to marshal message: %v", err)
		return
	}

	// Send to all connected users in this conversation
	// Iterate UserIDs in the conversation
	for userID := range users {
		// For each user, send to ALL their active clients
		if clients, ok := h.userConns[userID]; ok {
			for client := range clients {
				client.TrySend(messageJSON)
			}
		}
	}

	log.Printf("ChatHub: Broadcast to conversation %d (%d users)", conversationID, len(users))
}

// BroadcastToAllUsers sends a message to every connected websocket client.
func (h *ChatHub) BroadcastToAllUsers(message ChatMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Printf("ChatHub: Failed to marshal global message: %v", err)
		return
	}

	for _, clients := range h.userConns {
		for client := range clients {
			client.TrySend(messageJSON)
		}
	}
}

// GetActiveUsers returns the list of userIDs currently viewing a conversation
func (h *ChatHub) GetActiveUsers(conversationID uint) []uint {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users, ok := h.conversations[conversationID]
	if !ok {
		return []uint{}
	}

	result := make([]uint, 0, len(users))
	for userID := range users {
		result = append(result, userID)
	}
	return result
}

// IsUserActive checks if a user is currently viewing a conversation
func (h *ChatHub) IsUserActive(userID, conversationID uint) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if convs, ok := h.userActiveConvs[userID]; ok {
		_, active := convs[conversationID]
		return active
	}
	return false
}

// StartWiring connects the ChatHub to Redis pub/sub for conversation messages
func (h *ChatHub) StartWiring(ctx context.Context, n *Notifier) error {
	return n.StartChatSubscriber(ctx, func(channel, payload string) {
		// channel format: chat:conv:<id> or typing:conv:<id> or presence:conv:<id>
		var conversationID uint
		var msgType string

		// Parse channel to determine type and conversation ID
		if _, err := fmt.Sscanf(channel, "chat:conv:%d", &conversationID); err == nil {
			msgType = "message"
		} else if _, err := fmt.Sscanf(channel, "typing:conv:%d", &conversationID); err == nil {
			msgType = "typing"
		} else if _, err := fmt.Sscanf(channel, "presence:conv:%d", &conversationID); err == nil {
			msgType = "presence"
		} else {
			log.Printf("ChatHub: Invalid channel format: %s", channel)
			return
		}

		// Parse the payload
		var message ChatMessage
		if err := json.Unmarshal([]byte(payload), &message); err != nil {
			log.Printf("ChatHub: Failed to parse message from channel %s: %v", channel, err)
			return
		}

		// Ensure type is set
		if message.Type == "" {
			message.Type = msgType
		}
		message.ConversationID = conversationID

		// Broadcast to all users in the conversation
		h.BroadcastToConversation(conversationID, message)
	})
}

// BroadcastGlobalStatus sends a "user_status" event (online/offline) to ALL connected users
func (h *ChatHub) BroadcastGlobalStatus(userID uint, status string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	message := ChatMessage{
		Type:    "user_status",
		UserID:  userID,
		Payload: map[string]interface{}{"status": status, "user_id": userID},
	}

	jsonMsg, err := json.Marshal(message)
	if err != nil {
		log.Printf("ChatHub: Failed to marshal status message: %v", err)
		return
	}

	for id, clients := range h.userConns {
		// Don't echo back to the user who triggered it (optional, but good for noise reduction)
		if id == userID {
			continue
		}

		for client := range clients {
			client.TrySend(jsonMsg)
		}
	}
}

// Shutdown gracefully closes all websocket connections
func (h *ChatHub) Shutdown(_ context.Context) error {
	if h.presence != nil {
		h.presence.Stop()
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	// Close all user connections
	for userID, clients := range h.userConns {
		for client := range clients {
			if client.Conn == nil {
				continue
			}
			if err := client.Conn.WriteMessage(1, // TextMessage
				[]byte(`{"type":"server_shutdown","message":"Server is shutting down"}`)); err != nil {
				log.Printf("failed to write shutdown message for user %d: %v", userID, err)
			}
			if err := client.Conn.Close(); err != nil {
				log.Printf("failed to close websocket for user %d: %v", userID, err)
			}
		}
	}

	// Clear all state
	h.conversations = make(map[uint]map[uint]*Client)
	h.userActiveConvs = make(map[uint]map[uint]struct{})
	h.userConns = make(map[uint]map[*Client]bool)

	return nil
}

func (h *ChatHub) handleUserOnline(userID uint) {
	h.BroadcastGlobalStatus(userID, "online")
}

func (h *ChatHub) handleUserOffline(userID uint) {
	h.mu.Lock()
	if convs, ok := h.userActiveConvs[userID]; ok {
		for convID := range convs {
			if users, ok := h.conversations[convID]; ok {
				delete(users, userID)
				if len(users) == 0 {
					delete(h.conversations, convID)
				}
			}
		}
		delete(h.userActiveConvs, userID)
	}
	h.mu.Unlock()

	log.Printf("ChatHub: User %d marked offline after grace period", userID)
	h.BroadcastGlobalStatus(userID, "offline")
}

func (h *ChatHub) onlineUsersSnapshot(excludeUserID uint) []uint {
	var onlineIDs []uint
	if h.presence != nil {
		ids := h.presence.GetOnlineUserIDs(context.Background())
		onlineIDs = make([]uint, 0, len(ids))
		for _, id := range ids {
			if id == excludeUserID {
				continue
			}
			onlineIDs = append(onlineIDs, id)
		}
		return onlineIDs
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	onlineIDs = make([]uint, 0, len(h.userConns))
	for id := range h.userConns {
		if id == excludeUserID {
			continue
		}
		onlineIDs = append(onlineIDs, id)
	}
	return onlineIDs
}
