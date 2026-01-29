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

	// Map: conversationID -> userID -> websocket connection
	conversations map[uint]map[uint]*websocket.Conn

	// Map: userID -> set of conversationIDs they're actively viewing
	userActiveConvs map[uint]map[uint]struct{}

	// Map: userID -> their primary websocket connection
	userConns map[uint]*websocket.Conn
}

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
		conversations:   make(map[uint]map[uint]*websocket.Conn),
		userActiveConvs: make(map[uint]map[uint]struct{}),
		userConns:       make(map[uint]*websocket.Conn),
	}
}

// RegisterUser registers a user's websocket connection
func (h *ChatHub) RegisterUser(userID uint, conn *websocket.Conn) {
	h.mu.Lock()

	h.userConns[userID] = conn

	// Collect all currently online user IDs (excluding self)
	onlineIDs := make([]uint, 0, len(h.userConns))
	for id := range h.userConns {
		if id != userID {
			onlineIDs = append(onlineIDs, id)
		}
	}
	h.mu.Unlock()

	log.Printf("ChatHub: Registered user %d", userID)

	// 1. Send initial snapshot of online users to the NEW user
	if len(onlineIDs) > 0 {
		snapshotMsg := ChatMessage{
			Type:    "connected_users",
			Payload: map[string]interface{}{"user_ids": onlineIDs},
		}
		if jsonMsg, err := json.Marshal(snapshotMsg); err == nil {
			if err := conn.WriteMessage(websocket.TextMessage, jsonMsg); err != nil {
				log.Printf("ChatHub: Failed to send snapshot to user %d: %v", userID, err)
			}
		}
	}

	// 2. Broadcast "User X is Online" to everyone else
	h.BroadcastGlobalStatus(userID, "online")
}

// UnregisterUser removes a user's websocket connection and cleans up all their conversation subscriptions
func (h *ChatHub) UnregisterUser(userID uint) {
	h.mu.Lock()

	// Remove from all conversations
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

	// Remove user connection
	delete(h.userConns, userID)
	h.mu.Unlock()

	log.Printf("ChatHub: Unregistered user %d", userID)

	// Broadcast "User X is Offline" to everyone else
	h.BroadcastGlobalStatus(userID, "offline")
}

// JoinConversation subscribes a user to a conversation's messages
func (h *ChatHub) JoinConversation(userID, conversationID uint) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Get user's connection
	conn, ok := h.userConns[userID]
	if !ok {
		log.Printf("ChatHub: User %d not connected, cannot join conversation %d", userID, conversationID)
		return
	}

	// Add to conversation map
	if h.conversations[conversationID] == nil {
		h.conversations[conversationID] = make(map[uint]*websocket.Conn)
	}
	h.conversations[conversationID][userID] = conn

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
	for userID, conn := range users {
		if err := conn.WriteMessage(websocket.TextMessage, messageJSON); err != nil {
			log.Printf("ChatHub: Failed to send to user %d in conversation %d: %v", userID, conversationID, err)
		}
	}

	log.Printf("ChatHub: Broadcast to conversation %d (%d users)", conversationID, len(users))
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

	for id, conn := range h.userConns {
		// Don't echo back to the user who triggered it
		if id == userID {
			continue
		}
		if conn == nil {
			continue
		}

		// Fire and forget
		go func(c *websocket.Conn) {
			if err := c.WriteMessage(websocket.TextMessage, jsonMsg); err != nil {
				// Log but don't panic
			}
		}(conn)
	}
}
