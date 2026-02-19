// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/notifications"
	"sanctum/internal/service"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ChatroomCapabilities describes moderation capabilities for a chatroom.
type ChatroomCapabilities struct {
	CanModerate         bool `json:"can_moderate"`
	CanManageModerators bool `json:"can_manage_moderators"`
}

// ChatroomResponse is the API response shape for a chatroom/conversation.
type ChatroomResponse struct {
	*models.Conversation
	IsJoined     bool                  `json:"is_joined"`
	Capabilities *ChatroomCapabilities `json:"capabilities,omitempty"`
}

// CreateConversation handles POST /api/conversations
func (s *Server) CreateConversation(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	var req struct {
		Name           string `json:"name,omitempty"`
		IsGroup        bool   `json:"is_group,omitempty"`
		ParticipantIDs []uint `json:"participant_ids"`
	}
	if parseErr := c.BodyParser(&req); parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	conv, err := s.chatSvc().CreateConversation(ctx, service.CreateConversationInput{
		UserID:         userID,
		Name:           req.Name,
		IsGroup:        req.IsGroup,
		ParticipantIDs: req.ParticipantIDs,
	})
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "VALIDATION_ERROR" {
			status = fiber.StatusBadRequest
		}
		return models.RespondWithError(c, status, err)
	}

	return c.Status(fiber.StatusCreated).JSON(conv)
}

// GetConversations handles GET /api/conversations
func (s *Server) GetConversations(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	conversations, err := s.chatSvc().GetConversations(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	for _, conv := range conversations {
		if conv.IsGroup {
			conv.Participants = s.filterOnlineParticipants(conv.Participants)
		}
	}

	return c.JSON(conversations)
}

// GetConversation handles GET /api/conversations/:id
func (s *Server) GetConversation(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	conv, err := s.chatSvc().GetConversationForUser(ctx, convID, userID)
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "UNAUTHORIZED" {
			status = fiber.StatusForbidden
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}

	if conv.IsGroup {
		conv.Participants = s.filterOnlineParticipants(conv.Participants)
		caps, capErr := s.chatroomCapabilities(ctx, userID, conv.ID)
		if capErr != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, capErr)
		}
		return c.JSON(struct {
			*models.Conversation
			Capabilities *ChatroomCapabilities `json:"capabilities,omitempty"`
		}{
			Conversation: conv,
			Capabilities: caps,
		})
	}

	return c.JSON(conv)
}

// SendMessage handles POST /api/conversations/:id/messages
func (s *Server) SendMessage(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var req struct {
		Content     string          `json:"content"`
		MessageType string          `json:"message_type,omitempty"`
		Metadata    json.RawMessage `json:"metadata,omitempty"`
	}
	if parseErr := c.BodyParser(&req); parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	message, conv, err := s.chatSvc().SendMessage(ctx, service.SendMessageInput{
		UserID:         userID,
		ConversationID: convID,
		Content:        req.Content,
		MessageType:    req.MessageType,
		Metadata:       req.Metadata,
	})
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "VALIDATION_ERROR":
				status = fiber.StatusBadRequest
			case "UNAUTHORIZED":
				status = fiber.StatusForbidden
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}

	senderUsername := ""
	if message.Sender != nil {
		senderUsername = message.Sender.Username
	}
	s.persistMessageMentions(ctx, convID, message, userID, conv.Participants)

	// Broadcast message to all WebSocket-connected participants in real-time via ChatHub
	if s.chatHub != nil {
		s.chatHub.BroadcastToConversation(convID, notifications.ChatMessage{
			Type:           "message",
			ConversationID: convID,
			UserID:         userID,
			Username:       senderUsername,
			Payload:        message,
		})
	}

	// For public chatrooms, broadcast room-level realtime updates only to
	// connected participants in that conversation.
	if conv.IsGroup && s.chatHub != nil {
		s.chatHub.BroadcastToConversation(convID, notifications.ChatMessage{
			Type:           "room_message",
			ConversationID: convID,
			UserID:         userID,
			Username:       senderUsername,
			Payload:        message,
		})
	}

	// Notify only for direct messages; chatroom/group traffic should not trigger
	// global bell/toast notifications.
	if !conv.IsGroup {
		for _, participant := range conv.Participants {
			if participant.ID == userID {
				continue
			}
			s.publishUserEvent(participant.ID, EventMessageReceived, map[string]interface{}{
				"conversation_id": conv.ID,
				"message_id":      message.ID,
				"is_group":        conv.IsGroup,
				"from_user":       userSummaryPtr(message.Sender),
				"preview":         message.Content,
				"created_at":      time.Now().UTC().Format(time.RFC3339Nano),
			})
		}
	}

	return c.Status(fiber.StatusCreated).JSON(message)
}

// GetMessages handles GET /api/conversations/:id/messages
func (s *Server) GetMessages(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	page := parsePagination(c, 50)

	messages, err := s.chatSvc().GetMessagesForUser(ctx, convID, userID, page.Limit, page.Offset)
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "UNAUTHORIZED" {
			status = fiber.StatusForbidden
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}

	return c.JSON(messages)
}

// MarkConversationRead handles POST /api/conversations/:id/read
func (s *Server) MarkConversationRead(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	conv, err := s.chatSvc().GetConversationForUser(ctx, convID, userID)
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "UNAUTHORIZED" {
			status = fiber.StatusForbidden
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}
	if conv.IsGroup {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Read receipts are only supported for direct messages"))
	}

	now := time.Now().UTC()
	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.ConversationParticipant{}).
			Where("conversation_id = ? AND user_id = ?", convID, userID).
			Updates(map[string]interface{}{
				"last_read_at": now,
				"unread_count": 0,
			}).Error; err != nil {
			return err
		}

		return tx.Model(&models.Message{}).
			Where("conversation_id = ? AND sender_id <> ? AND is_read = ?", convID, userID, false).
			Updates(map[string]interface{}{
				"is_read": true,
				"read_at": now,
			}).Error
	})
	if txErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, txErr)
	}

	if s.chatHub != nil {
		s.chatHub.BroadcastToConversation(convID, notifications.ChatMessage{
			Type:           "message_read",
			ConversationID: convID,
			UserID:         userID,
			Payload: map[string]interface{}{
				"conversation_id": convID,
				"user_id":         userID,
				"read_at":         now.Format(time.RFC3339Nano),
			},
		})
	}

	return c.JSON(fiber.Map{"message": "Conversation marked as read"})
}

// AddParticipant handles POST /api/conversations/:id/participants
func (s *Server) AddParticipant(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var req struct {
		UserID uint `json:"user_id"`
	}
	if parseErr := c.BodyParser(&req); parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	if err := s.chatSvc().AddParticipant(ctx, convID, userID, req.UserID); err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "UNAUTHORIZED":
				status = fiber.StatusForbidden
			case "VALIDATION_ERROR":
				status = fiber.StatusBadRequest
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}

	return c.SendStatus(fiber.StatusOK)
}

// LeaveConversation handles DELETE /api/conversations/:id
// Removes the current user from a conversation so it no longer appears in their list.
func (s *Server) LeaveConversation(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	conv, err := s.chatSvc().LeaveConversation(ctx, convID, userID)
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "UNAUTHORIZED" {
			status = fiber.StatusForbidden
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}

	if conv.IsGroup {
		s.broadcastChatroomPresenceSnapshot(ctx, convID, userID, "", "left_room")
	}

	return c.JSON(fiber.Map{"message": "Conversation removed"})
}

func (s *Server) chatSvc() *service.ChatService {
	return s.chatService
}

// GetAllChatrooms handles GET /api/chatrooms - returns ALL public chatrooms
func (s *Server) GetAllChatrooms(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	chatrooms, err := s.chatSvc().GetAllChatrooms(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	result := make([]ChatroomResponse, 0, len(chatrooms))
	for _, room := range chatrooms {
		caps, err := s.chatroomCapabilities(ctx, userID, room.Conversation.ID)
		if err != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, err)
		}
		result = append(result, ChatroomResponse{
			Conversation: room.Conversation,
			IsJoined:     room.IsJoined,
			Capabilities: caps,
		})
	}

	return c.JSON(result)
}

// GetJoinedChatrooms handles GET /api/chatrooms/joined - returns chatrooms the user has joined
func (s *Server) GetJoinedChatrooms(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	chatrooms, err := s.chatSvc().GetJoinedChatrooms(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	result := make([]ChatroomResponse, 0, len(chatrooms))
	for _, room := range chatrooms {
		caps, err := s.chatroomCapabilities(ctx, userID, room.ID)
		if err != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, err)
		}
		result = append(result, ChatroomResponse{
			Conversation: room,
			IsJoined:     true,
			Capabilities: caps,
		})
	}

	return c.JSON(result)
}

// JoinChatroom handles POST /api/chatrooms/:id/join - join a chatroom
func (s *Server) JoinChatroom(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	if _, err := s.chatSvc().JoinChatroom(ctx, roomID, userID); err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			case "VALIDATION_ERROR":
				status = fiber.StatusBadRequest
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}

	s.broadcastChatroomPresenceSnapshot(ctx, roomID, userID, "", "joined_room")
	s.maybeSendWelcomeRoomJoinMessage(ctx, userID, roomID)

	return c.JSON(fiber.Map{"message": "Joined chatroom successfully"})
}

// RemoveParticipant handles DELETE /api/chatrooms/:id/participants/:participantId (admin only)
func (s *Server) RemoveParticipant(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	participantID, err := s.parseID(c, "participantId")
	if err != nil {
		return nil
	}

	username, err := s.chatSvc().RemoveParticipant(ctx, roomID, userID, participantID)
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			case "UNAUTHORIZED":
				status = fiber.StatusForbidden
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}

	s.broadcastChatroomPresenceSnapshot(ctx, roomID, userID, username, "removed_participant")

	return c.JSON(fiber.Map{"message": "Participant removed successfully"})
}

func (s *Server) chatroomCapabilities(ctx context.Context, userID, roomID uint) (*ChatroomCapabilities, error) {
	canModerate, err := s.canModerateChatroomByUserID(ctx, userID, roomID)
	if err != nil {
		return nil, err
	}
	canManageModerators, err := s.canManageChatroomModeratorsByUserID(ctx, userID, roomID)
	if err != nil {
		return nil, err
	}
	return &ChatroomCapabilities{
		CanModerate:         canModerate,
		CanManageModerators: canManageModerators,
	}, nil
}

// GetChatroomModerators handles GET /api/chatrooms/:id/moderators.
func (s *Server) GetChatroomModerators(c *fiber.Ctx) error {
	ctx := c.UserContext()
	actorUserID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	authorized, err := s.canManageChatroomModeratorsByUserID(ctx, actorUserID, roomID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !authorized {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Chatroom moderator management access required"))
	}

	var moderators []models.ChatroomModerator
	if err := s.db.WithContext(ctx).
		Where("conversation_id = ?", roomID).
		Order("created_at ASC").
		Find(&moderators).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	type ChatroomModeratorDTO struct {
		ConversationID  uint   `json:"conversation_id"`
		UserID          uint   `json:"user_id"`
		GrantedByUserID uint   `json:"granted_by_user_id"`
		CreatedAt       string `json:"created_at"`
	}
	resp := make([]ChatroomModeratorDTO, 0, len(moderators))
	for _, mod := range moderators {
		resp = append(resp, ChatroomModeratorDTO{
			ConversationID:  mod.ConversationID,
			UserID:          mod.UserID,
			GrantedByUserID: mod.GrantedByUserID,
			CreatedAt:       mod.CreatedAt.UTC().Format(time.RFC3339Nano),
		})
	}

	return c.JSON(resp)
}

// AddChatroomModerator handles POST /api/chatrooms/:id/moderators/:userId.
func (s *Server) AddChatroomModerator(c *fiber.Ctx) error {
	ctx := c.UserContext()
	actorUserID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	targetUserID, err := s.parseID(c, "userId")
	if err != nil {
		return nil
	}

	authorized, err := s.canManageChatroomModeratorsByUserID(ctx, actorUserID, roomID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !authorized {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Chatroom moderator management access required"))
	}

	var user models.User
	if err := s.db.WithContext(ctx).Select("id").First(&user, targetUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("User", targetUserID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	moderator := models.ChatroomModerator{
		ConversationID:  roomID,
		UserID:          targetUserID,
		GrantedByUserID: actorUserID,
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&moderator).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if err := s.db.WithContext(ctx).
		Where("conversation_id = ? AND user_id = ?", roomID, targetUserID).
		First(&moderator).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(moderator)
}

// RemoveChatroomModerator handles DELETE /api/chatrooms/:id/moderators/:userId.
func (s *Server) RemoveChatroomModerator(c *fiber.Ctx) error {
	ctx := c.UserContext()
	actorUserID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	targetUserID, err := s.parseID(c, "userId")
	if err != nil {
		return nil
	}

	authorized, err := s.canManageChatroomModeratorsByUserID(ctx, actorUserID, roomID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !authorized {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Chatroom moderator management access required"))
	}

	if err := s.db.WithContext(ctx).
		Where("conversation_id = ? AND user_id = ?", roomID, targetUserID).
		Delete(&models.ChatroomModerator{}).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "Chatroom moderator removed successfully"})
}

func (s *Server) filterOnlineParticipants(participants []models.User) []models.User {
	if len(participants) == 0 {
		return participants
	}

	if s.chatHub == nil {
		return []models.User{}
	}

	online := make([]models.User, 0, len(participants))
	for _, participant := range participants {
		if s.chatHub.IsUserOnline(participant.ID) {
			online = append(online, participant)
		}
	}
	return online
}
