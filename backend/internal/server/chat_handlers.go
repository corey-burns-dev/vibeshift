// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"encoding/json"
	"errors"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/notifications"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CreateConversation handles POST /api/conversations
func (s *Server) CreateConversation(c *fiber.Ctx) error {
	ctx := c.Context()
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

	// For group chats, name is required
	if req.IsGroup && req.Name == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Group conversations require a name"))
	}

	// Must have at least one participant besides creator
	if len(req.ParticipantIDs) == 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("At least one participant is required"))
	}

	// For direct messages, reuse existing 1:1 conversation when present.
	if !req.IsGroup && len(req.ParticipantIDs) == 1 && req.ParticipantIDs[0] != userID && s.db != nil {
		otherUserID := req.ParticipantIDs[0]
		var existing models.Conversation
		findErr := s.db.WithContext(ctx).
			Model(&models.Conversation{}).
			Joins(
				"JOIN conversation_participants cp_self ON cp_self.conversation_id = conversations.id AND cp_self.user_id = ?",
				userID,
			).
			Joins(
				"JOIN conversation_participants cp_other ON cp_other.conversation_id = conversations.id AND cp_other.user_id = ?",
				otherUserID,
			).
			Where("conversations.is_group = ?", false).
			Where(
				"NOT EXISTS (SELECT 1 FROM conversation_participants cp_extra WHERE cp_extra.conversation_id = conversations.id AND cp_extra.user_id NOT IN (?, ?))",
				userID,
				otherUserID,
			).
			Order("conversations.updated_at DESC").
			First(&existing).Error
		switch {
		case findErr == nil:
			existingConv, err := s.chatRepo.GetConversation(ctx, existing.ID)
			if err != nil {
				return models.RespondWithError(c, fiber.StatusInternalServerError, err)
			}
			return c.Status(fiber.StatusCreated).JSON(existingConv)
		case errors.Is(findErr, gorm.ErrRecordNotFound):
			// Create a new DM below.
		default:
			return models.RespondWithError(c, fiber.StatusInternalServerError, findErr)
		}
	}

	conv := &models.Conversation{
		Name:      req.Name,
		IsGroup:   req.IsGroup,
		CreatedBy: userID,
	}

	if err := s.chatRepo.CreateConversation(ctx, conv); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Add creator as participant
	if err := s.chatRepo.AddParticipant(ctx, conv.ID, userID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Add other participants
	for _, participantID := range req.ParticipantIDs {
		// Skip if participant is the creator (already added)
		if participantID == userID {
			continue
		}
		if err := s.chatRepo.AddParticipant(ctx, conv.ID, participantID); err != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, err)
		}
	}

	// Load full conversation for response
	conv, err := s.chatRepo.GetConversation(ctx, conv.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.Status(fiber.StatusCreated).JSON(conv)
}

// GetConversations handles GET /api/conversations
func (s *Server) GetConversations(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	conversations, err := s.chatRepo.GetUserConversations(ctx, userID)
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
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check if user is participant
	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	if conv.IsGroup {
		conv.Participants = s.filterOnlineParticipants(conv.Participants)
	}

	return c.JSON(conv)
}

// SendMessage handles POST /api/conversations/:id/messages
func (s *Server) SendMessage(c *fiber.Ctx) error {
	ctx := c.Context()
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

	if req.Content == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Message content is required"))
	}

	if req.MessageType == "" {
		req.MessageType = "text"
	}

	// Check if user is participant in conversation
	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	if req.Metadata == nil {
		req.Metadata = json.RawMessage("{}")
	}

	message := &models.Message{
		ConversationID: convID,
		SenderID:       userID,
		Content:        req.Content,
		MessageType:    req.MessageType,
		Metadata:       req.Metadata,
	}

	if err := s.chatRepo.CreateMessage(ctx, message); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Load message with sender info for response
	// We attempt to load sender info but can gracefully continue if it fails
	if sender, err := s.userRepo.GetByID(ctx, userID); err == nil {
		message.Sender = sender
	}
	senderUsername := ""
	if message.Sender != nil {
		senderUsername = message.Sender.Username
	}

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

	// For public chatrooms, broadcast room-level realtime updates to all connected users
	// so room tabs/counters can react even when the room isn't currently open.
	if conv.IsGroup && s.chatHub != nil {
		s.chatHub.BroadcastToAllUsers(notifications.ChatMessage{
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
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	page := parsePagination(c, 50)

	// Check if user is participant
	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	messages, err := s.chatRepo.GetMessages(ctx, convID, page.Limit, page.Offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(messages)
}

// AddParticipant handles POST /api/conversations/:id/participants
func (s *Server) AddParticipant(c *fiber.Ctx) error {
	ctx := c.Context()
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

	// Check if current user is participant and conversation is group
	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	if !conv.IsGroup {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Cannot add participants to 1-on-1 conversations"))
	}

	if err := s.chatRepo.AddParticipant(ctx, convID, req.UserID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusOK)
}

// LeaveConversation handles DELETE /api/conversations/:id
// Removes the current user from a conversation so it no longer appears in their list.
func (s *Server) LeaveConversation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}
	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	if err := s.chatRepo.RemoveParticipant(ctx, convID, userID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	if conv.IsGroup {
		s.broadcastChatroomPresenceSnapshot(ctx, convID, userID, "", "left_room")
	}

	return c.JSON(fiber.Map{"message": "Conversation removed"})
}

// GetAllChatrooms handles GET /api/chatrooms - returns ALL public chatrooms
func (s *Server) GetAllChatrooms(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	// Get all group conversations (public chatrooms)
	var chatrooms []*models.Conversation
	err := s.db.WithContext(ctx).
		Where("is_group = ?", true).
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Limit(1)
		}).
		Preload("Messages.Sender").
		Order("name ASC").
		Find(&chatrooms).Error
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Add "is_joined" field to each chatroom
	type ChatroomResponse struct {
		*models.Conversation
		IsJoined bool `json:"is_joined"`
	}

	result := make([]ChatroomResponse, 0, len(chatrooms))
	for _, room := range chatrooms {
		isJoined := false
		for _, p := range room.Participants {
			if p.ID == userID {
				isJoined = true
				break
			}
		}
		result = append(result, ChatroomResponse{
			Conversation: room,
			IsJoined:     isJoined,
		})
	}

	return c.JSON(result)
}

// GetJoinedChatrooms handles GET /api/chatrooms/joined - returns chatrooms the user has joined
func (s *Server) GetJoinedChatrooms(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	// Get only group conversations where user is a participant
	var chatrooms []*models.Conversation
	err := s.db.WithContext(ctx).
		Joins("JOIN conversation_participants cp ON cp.conversation_id = conversations.id").
		Where("conversations.is_group = ? AND cp.user_id = ?", true, userID).
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Limit(1)
		}).
		Preload("Messages.Sender").
		Order("conversations.name ASC").
		Find(&chatrooms).Error
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(chatrooms)
}

// JoinChatroom handles POST /api/chatrooms/:id/join - join a chatroom
func (s *Server) JoinChatroom(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	// Verify the conversation exists and is a group
	var conv models.Conversation
	if queryErr := s.db.WithContext(ctx).First(&conv, roomID).Error; queryErr != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Chatroom", roomID))
	}

	if !conv.IsGroup {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Cannot join a 1-on-1 conversation"))
	}

	// Add user to the chatroom (ignore if already joined)
	err = s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&models.ConversationParticipant{
		ConversationID: roomID,
		UserID:         userID,
	}).Error
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	s.broadcastChatroomPresenceSnapshot(ctx, roomID, userID, "", "joined_room")

	return c.JSON(fiber.Map{"message": "Joined chatroom successfully"})
}

// RemoveParticipant handles DELETE /api/chatrooms/:id/participants/:participantId (admin only)
func (s *Server) RemoveParticipant(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	participantID, err := s.parseID(c, "participantId")
	if err != nil {
		return nil
	}

	// Check if user is admin or room creator
	admin, adminErr := s.isAdmin(c, userID)
	if adminErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, adminErr)
	}

	var conv models.Conversation
	if err := s.db.WithContext(ctx).First(&conv, roomID).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Chatroom", roomID))
	}

	// Only admin or room creator can remove participants
	if !admin && conv.CreatedBy != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Only admins or room creator can remove participants"))
	}

	// Remove participant from chatroom
	if err := s.db.WithContext(ctx).
		Where("conversation_id = ? AND user_id = ?", roomID, participantID).
		Delete(&models.ConversationParticipant{}).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Look up username for presence broadcast
	var user models.User
	username := ""
	if uErr := s.db.WithContext(ctx).Select("username").First(&user, userID).Error; uErr == nil {
		username = user.Username
	}

	s.broadcastChatroomPresenceSnapshot(ctx, roomID, userID, username, "removed_participant")

	return c.JSON(fiber.Map{"message": "Participant removed successfully"})
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
