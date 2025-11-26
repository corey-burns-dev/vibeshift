package server

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"strings"

	"vibeshift/models"
	"vibeshift/notifications"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/golang-jwt/jwt/v5"
)

// WebSocketChatHandler handles WebSocket connections for real-time chat
func (s *Server) WebSocketChatHandler() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		ctx := context.Background()

		// Authenticate user via query parameter or initial message
		token := conn.Query("token")
		if token == "" {
			// Try to read auth message
			_, msg, err := conn.ReadMessage()
			if err != nil {
				if cerr := conn.Close(); cerr != nil {
					log.Printf("websocket close error: %v", cerr)
				}
				return
			}
			txt := string(msg)
			if !strings.HasPrefix(txt, "auth:") {
				if werr := conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"first message must be auth:token"}`)); werr != nil {
					log.Printf("websocket write error: %v", werr)
				}
				if cerr := conn.Close(); cerr != nil {
					log.Printf("websocket close error: %v", cerr)
				}
				return
			}
			token = strings.TrimPrefix(txt, "auth:")
		}

		// Validate JWT token
		userID, username, err := s.validateChatToken(token)
		if err != nil {
			if werr := conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"invalid token"}`)); werr != nil {
				log.Printf("websocket write error: %v", werr)
			}
			if cerr := conn.Close(); cerr != nil {
				log.Printf("websocket close error: %v", cerr)
			}
			return
		}

		log.Printf("WebSocket: User %d (%s) connected to chat", userID, username)

		// Register user with ChatHub
		if s.chatHub != nil {
			s.chatHub.RegisterUser(userID, conn)
			defer s.chatHub.UnregisterUser(userID)
		}

		// Send welcome message
		welcomeMsg := notifications.ChatMessage{
			Type:    "connected",
			Payload: map[string]interface{}{"user_id": userID, "username": username},
		}
		welcomeJSON, _ := json.Marshal(welcomeMsg)
		if werr := conn.WriteMessage(websocket.TextMessage, welcomeJSON); werr != nil {
			log.Printf("failed to send welcome message: %v", werr)
		}

		// Message handling loop
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				log.Printf("WebSocket: User %d disconnected: %v", userID, err)
				break
			}

			// Parse incoming message
			var incomingMsg map[string]interface{}
			if err := json.Unmarshal(msg, &incomingMsg); err != nil {
				log.Printf("WebSocket: Invalid message format from user %d", userID)
				continue
			}

			msgType, ok := incomingMsg["type"].(string)
			if !ok {
				continue
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

							// Publish presence
							if s.notifier != nil {
								if perr := s.notifier.PublishPresence(ctx, convID, userID, username, "online"); perr != nil {
									log.Printf("publish presence (online) error: %v", perr)
								}
							}

							// Send confirmation
							response := notifications.ChatMessage{
								Type:           "joined",
								ConversationID: convID,
								Payload:        map[string]interface{}{"conversation_id": convID},
							}
							responseJSON, _ := json.Marshal(response)
							if werr := conn.WriteMessage(websocket.TextMessage, responseJSON); werr != nil {
								log.Printf("websocket write error sending joined confirmation: %v", werr)
							}
						}
					}
				}

			case "leave":
				// Leave a conversation
				if convIDFloat, ok := incomingMsg["conversation_id"].(float64); ok {
					convID := uint(convIDFloat)
					if s.chatHub != nil {
						s.chatHub.LeaveConversation(userID, convID)

						// Publish presence
						if s.notifier != nil {
							if perr := s.notifier.PublishPresence(ctx, convID, userID, username, "offline"); perr != nil {
								log.Printf("publish presence (offline) error: %v", perr)
							}
						}
					}
				}

			case "typing":
				// Typing indicator
				if convIDFloat, ok := incomingMsg["conversation_id"].(float64); ok {
					convID := uint(convIDFloat)
					isTyping, _ := incomingMsg["is_typing"].(bool)

					if s.notifier != nil && s.isUserParticipant(ctx, userID, convID) {
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
						// Create message in database
						message := &models.Message{
							ConversationID: convID,
							SenderID:       userID,
							Content:        content,
							MessageType:    "text",
						}

						if err := s.chatRepo.CreateMessage(ctx, message); err != nil {
							log.Printf("WebSocket: Failed to create message: %v", err)
							continue
						}

						// Load sender info
						message.Sender, _ = s.userRepo.GetByID(ctx, userID)

						// Broadcast via Redis
						if s.notifier != nil {
							messageJSON, _ := json.Marshal(notifications.ChatMessage{
								Type:           "message",
								ConversationID: convID,
								UserID:         userID,
								Username:       username,
								Payload:        message,
							})
							if perr := s.notifier.PublishChatMessage(ctx, convID, string(messageJSON)); perr != nil {
								log.Printf("publish chat message error: %v", perr)
							}
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
	})
}

// validateChatToken validates a JWT token and returns userID and username
func (s *Server) validateChatToken(tokenString string) (uint, string, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.NewError(fiber.StatusUnauthorized, "Invalid signing method")
		}
		return []byte(s.config.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return 0, "", err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, "", fiber.NewError(fiber.StatusUnauthorized, "Invalid claims")
	}

	sub, ok := claims["sub"].(string)
	if !ok {
		return 0, "", fiber.NewError(fiber.StatusUnauthorized, "Invalid subject")
	}

	userID, err := strconv.ParseUint(sub, 10, 32)
	if err != nil {
		return 0, "", err
	}

	// Get username from database
	user, err := s.userRepo.GetByID(context.Background(), uint(userID))
	if err != nil {
		return 0, "", err
	}

	return uint(userID), user.Username, nil
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
