// Package notifications provides real-time notification delivery and management.
package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/gofiber/websocket/v2"
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
func NewChatHub() *ChatHub {
	return &ChatHub{
		conversations:   make(map[uint]map[uint]*Client),
		userActiveConvs: make(map[uint]map[uint]struct{}),
		userConns:       make(map[uint]map[*Client]bool),
	}
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
	h.userConns[userID][client] = true

	// Collect online users
	onlineIDs := make([]uint, 0, len(h.userConns))
	for id := range h.userConns {
		if id != userID {
			onlineIDs = append(onlineIDs, id)
		}
	}
	h.mu.Unlock()

	log.Printf("ChatHub: Registered user %d (Active clients: %d)", userID, len(h.userConns[userID]))

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

	h.BroadcastGlobalStatus(userID, "online")
	return client, nil
}

// RegisterUser is a legacy wrapper for Register. Deprecated: use Register instead.
func (h *ChatHub) RegisterUser(client *Client) {
	h.mu.Lock()
	if h.userConns[client.UserID] == nil {
		h.userConns[client.UserID] = make(map[*Client]bool)
	}
	h.userConns[client.UserID][client] = true
	h.mu.Unlock()
	h.BroadcastGlobalStatus(client.UserID, "online")
}

// UnregisterUser is a legacy wrapper for UnregisterClient.
func (h *ChatHub) UnregisterUser(client *Client) {
	h.UnregisterClient(client)
}

// UnregisterClient removes a user's websocket connection and cleans up all their conversation subscriptions
func (h *ChatHub) UnregisterClient(client *Client) {
	h.mu.Lock()

	// Remove from connection set
	if clients, ok := h.userConns[client.UserID]; ok {
		delete(clients, client)
		// If NO more connections for this user, then they are offline
		if len(clients) == 0 {
			delete(h.userConns, client.UserID)
			// Proceed to cleanup conversation subscriptions
		} else {
			// User still has other connections, so just close this one and return
			h.mu.Unlock()
			log.Printf("ChatHub: Unregistered client for user %d (Remaining clients: %d)", client.UserID, len(clients))
			return
		}
	} else {
		// Client not found (already removed)
		h.mu.Unlock()
		return
	}

	// Logic below only runs if ALL connections for this user are gone

	// Remove from all conversations
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
		log.Printf("ChatHub: No active users in conversation %d", conversationID)
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
	h.mu.Lock()
	defer h.mu.Unlock()

	// Close all user connections
	for userID, clients := range h.userConns {
		for client := range clients {
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
