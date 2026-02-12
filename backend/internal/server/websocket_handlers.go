// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"sanctum/internal/middleware"
	"sanctum/internal/models"
	"sanctum/internal/notifications"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

// WebSocketChatHandler handles WebSocket connections for real-time chat
func (s *Server) WebSocketChatHandler() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		middleware.ActiveWebSockets.Inc()
		defer middleware.ActiveWebSockets.Dec()

		ctx := context.Background()

		// Get userID from context locals (set by AuthRequired middleware)
		userIDVal := conn.Locals("userID")
		if userIDVal == nil {
			log.Printf("WebSocket Chat: Unauthenticated connection attempt")
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"unauthorized"}`))
			_ = conn.Close()
			return
		}
		userID := userIDVal.(uint)

		// Get user info for username
		user, err := s.userRepo.GetByID(ctx, userID)
		if err != nil {
			log.Printf("WebSocket Chat: Failed to get user %d: %v", userID, err)
			_ = conn.Close()
			return
		}
		username := user.Username

		log.Printf("WebSocket: User %d (%s) connected to chat", userID, username)

		// Register user with ChatHub
		if s.chatHub == nil {
			_ = conn.Close()
			return
		}

		client, err := s.chatHub.Register(userID, conn)
		if err != nil {
			log.Printf("WebSocket Chat: Failed to register user %d: %v", userID, err)
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"`+err.Error()+`"}`))
			_ = conn.Close()
			return
		}

		// Define Incoming Message Handler
		client.IncomingHandler = func(c *notifications.Client, message []byte) {
			// Parse incoming message
			var incomingMsg map[string]interface{}
			if err := json.Unmarshal(message, &incomingMsg); err != nil {
				log.Printf("WebSocket: Invalid message format from user %d", userID)
				return
			}

			msgType, ok := incomingMsg["type"].(string)
			if !ok {
				return
			}

			// Handle different message types
			switch msgType {
			case "join":
				// Join a conversation
				if convIDFloat, ok := incomingMsg["conversation_id"].(float64); ok {
					convID := uint(convIDFloat)
					if s.chatHub != nil {
						// Verify user is participant before joining
						if s.isUserParticipant(ctx, userID, convID) {
							s.chatHub.JoinConversation(userID, convID)

							// Send confirmation to user
							response := notifications.ChatMessage{
								Type:           "joined",
								ConversationID: convID,
								Payload:        map[string]interface{}{"conversation_id": convID},
							}
							responseJSON, _ := json.Marshal(response)
							c.TrySend(responseJSON)
						}
					}
				}

			case "leave":
				// Leave a conversation
				if convIDFloat, ok := incomingMsg["conversation_id"].(float64); ok {
					convID := uint(convIDFloat)
					if s.chatHub != nil {
						s.chatHub.LeaveConversation(userID, convID)
					}
				}

			case "typing":
				// Typing indicator - limit to 10 per 10 seconds to prevent spam
				if convIDFloat, ok := incomingMsg["conversation_id"].(float64); ok {
					convID := uint(convIDFloat)
					isTyping, _ := incomingMsg["is_typing"].(bool)

					if s.notifier != nil && s.isUserParticipant(ctx, userID, convID) {
						// Rate limit typing indicators
						id := fmt.Sprintf("user:%d", userID)
						allowed, _ := middleware.CheckRateLimit(ctx, s.redis, "typing", id, 10, 10*time.Second)
						if !allowed {
							return // Silently drop spammy typing indicators
						}

						if perr := s.notifier.PublishTypingIndicator(ctx, convID, userID, username, isTyping); perr != nil {
							log.Printf("publish typing indicator error: %v", perr)
						}
					}
				}

			case "message":
				// Send a message (alternative to HTTP endpoint)
				if convIDFloat, ok := incomingMsg["conversation_id"].(float64); ok {
					convID := uint(convIDFloat)
					content, _ := incomingMsg["content"].(string)

					if content != "" && s.isUserParticipant(ctx, userID, convID) {
						// Rate limit messages - same as HTTP (15 per minute)
						id := fmt.Sprintf("user:%d", userID)
						allowed, _ := middleware.CheckRateLimit(ctx, s.redis, "send_chat", id, 15, time.Minute)
						if !allowed {
							response := notifications.ChatMessage{
								Type: "error",
								Payload: map[string]string{
									"message": "Rate limit exceeded. Please wait a moment.",
								},
							}
							if respJSON, err := json.Marshal(response); err == nil {
								c.TrySend(respJSON)
							}
							return
						}

						// Create message in database
						message := &models.Message{
							ConversationID: convID,
							SenderID:       userID,
							Content:        content,
							MessageType:    "text",
						}

						if err := s.chatRepo.CreateMessage(ctx, message); err != nil {
							log.Printf("WebSocket: Failed to create message: %v", err)
							return
						}

						// Load sender info - best-effort attempt
						if sender, err := s.userRepo.GetByID(ctx, userID); err == nil {
							message.Sender = sender
						}

						// Broadcast via Redis
						if s.notifier != nil {
							messageJSON, err := json.Marshal(notifications.ChatMessage{
								Type:           "message",
								ConversationID: convID,
								UserID:         userID,
								Username:       username,
								Payload:        message,
							})
							if err != nil {
								log.Printf("marshal chat message error: %v", err)
								return
							}
							if perr := s.notifier.PublishChatMessage(ctx, convID, string(messageJSON)); perr != nil {
								log.Printf("publish chat message error: %v", perr)
							}
						}

						if s.chatHub != nil && s.isGroupConversation(ctx, convID) {
							s.chatHub.BroadcastToConversation(convID, notifications.ChatMessage{
								Type:           "room_message",
								ConversationID: convID,
								UserID:         userID,
								Username:       username,
								Payload:        message,
							})
						}
					}
				}

			case "read":
				// Mark conversation as read
				if convIDFloat, ok := incomingMsg["conversation_id"].(float64); ok {
					convID := uint(convIDFloat)
					if s.isUserParticipant(ctx, userID, convID) {
						if uerr := s.chatRepo.UpdateLastRead(ctx, convID, userID); uerr != nil {
							log.Printf("update last read error: %v", uerr)
						}

						// Broadcast read receipt
						if s.notifier != nil {
							readMsg := notifications.ChatMessage{
								Type:           "read",
								ConversationID: convID,
								UserID:         userID,
								Username:       username,
								Payload:        map[string]interface{}{"conversation_id": convID, "user_id": userID},
							}
							readJSON, _ := json.Marshal(readMsg)
							if perr := s.notifier.PublishChatMessage(ctx, convID, string(readJSON)); perr != nil {
								log.Printf("publish read receipt error: %v", perr)
							}
						}
					}
				}
			}
		}

		// Send welcome message
		welcomeMsg := notifications.ChatMessage{
			Type:    "connected",
			Payload: map[string]interface{}{"user_id": userID, "username": username},
		}
		if welcomeJSON, err := json.Marshal(welcomeMsg); err == nil {
			client.TrySend(welcomeJSON)
		}

		// Start write pump in a goroutine
		go client.WritePump()

		// Read pump runs in the main handler goroutine (blocking)
		client.ReadPump()

		// Broadcast offline presence for any rooms the user was in
		if s.chatHub != nil && !s.chatHub.IsUserOnline(userID) {
			// User's last connection dropped — broadcast offline status to their rooms
			var roomIDs []uint
			s.db.WithContext(ctx).
				Table("conversation_participants AS cp").
				Joins("JOIN conversations c ON c.id = cp.conversation_id").
				Where("cp.user_id = ? AND c.is_group = ?", userID, true).
				Pluck("cp.conversation_id", &roomIDs)
			for _, roomID := range roomIDs {
				s.chatHub.LeaveConversation(userID, roomID)
				s.broadcastChatroomPresenceSnapshot(ctx, roomID, userID, username, "offline")
			}
		}
	})
}

// isUserParticipant checks if a user is a participant in a conversation
func (s *Server) isUserParticipant(ctx context.Context, userID, conversationID uint) bool {
	conv, err := s.chatRepo.GetConversation(ctx, conversationID)
	if err != nil {
		return false
	}

	for _, participant := range conv.Participants {
		if participant.ID == userID {
			return true
		}
	}
	return false
}

func (s *Server) isGroupConversation(ctx context.Context, conversationID uint) bool {
	var conversation models.Conversation
	if err := s.db.WithContext(ctx).
		Select("id", "is_group").
		First(&conversation, conversationID).Error; err != nil {
		return false
	}
	return conversation.IsGroup
}

// removeUserFromAllGroupChatrooms is intentionally removed.
// Chatroom membership is now persistent — users stay in rooms across sessions.

func (s *Server) broadcastChatroomPresenceSnapshot(
	ctx context.Context,
	conversationID uint,
	userID uint,
	username string,
	action string,
) {
	if s.chatHub == nil {
		return
	}

	conv, err := s.chatRepo.GetConversation(ctx, conversationID)
	if err != nil || !conv.IsGroup {
		return
	}

	// Compute which participants are currently online via the ChatHub
	onlineIDs := make([]uint, 0)
	for _, p := range conv.Participants {
		if s.chatHub.IsUserOnline(p.ID) {
			onlineIDs = append(onlineIDs, p.ID)
		}
	}

	s.chatHub.BroadcastToAllUsers(notifications.ChatMessage{
		Type:           "chatroom_presence",
		ConversationID: conversationID,
		UserID:         userID,
		Username:       username,
		Payload: map[string]interface{}{
			"conversation_id": conversationID,
			"user_id":         userID,
			"username":        username,
			"action":          action,
			"participants":    conv.Participants,
			"member_count":    len(conv.Participants),
			"online_user_ids": onlineIDs,
		},
	})
}
