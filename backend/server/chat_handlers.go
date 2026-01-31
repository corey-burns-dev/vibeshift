// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"encoding/json"
	"vibeshift/models"
	"vibeshift/notifications"

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

	// Get all group conversations
	var allGroupConversations []*models.Conversation
	err := s.db.WithContext(ctx).
		Where("is_group = ?", true).
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Limit(1)
		}).
		Preload("Messages.Sender").
		Order("name ASC").
		Find(&allGroupConversations).Error
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Auto-add user to any group conversations they're not in
	for _, conv := range allGroupConversations {
		isParticipant := false
		for _, p := range conv.Participants {
			if p.ID == userID {
				isParticipant = true
				break
			}
		}
		// If user is not a participant, add them (ignore errors if already exists)
		if !isParticipant {
			// Use OnConflict to avoid duplicate key errors
			s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&models.ConversationParticipant{
				ConversationID: conv.ID,
				UserID:         userID,
			})
		}
	}

	// Get user's conversations (now includes all group conversations)
	conversations, err := s.chatRepo.GetUserConversations(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(conversations)
}

// GetConversation handles GET /api/conversations/:id
func (s *Server) GetConversation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil || convID < 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	conv, err := s.chatRepo.GetConversation(ctx, uint(convID))
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

	// Auto-add user to group conversations if not already a participant
	if !isParticipant && conv.IsGroup {
		s.chatRepo.AddParticipant(ctx, uint(convID), userID)
		isParticipant = true // Trust that add succeeded
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	return c.JSON(conv)
}

// SendMessage handles POST /api/conversations/:id/messages
func (s *Server) SendMessage(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil || convID < 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
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
	conv, err := s.chatRepo.GetConversation(ctx, uint(convID))
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

	// Auto-add user to group conversations if not already a participant
	if !isParticipant && conv.IsGroup {
		s.chatRepo.AddParticipant(ctx, uint(convID), userID)
		isParticipant = true // Trust that add succeeded
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	if req.Metadata == nil {
		req.Metadata = json.RawMessage("{}")
	}

	message := &models.Message{
		ConversationID: uint(convID),
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

	// Broadcast message to all WebSocket-connected participants in real-time via ChatHub
	if s.chatHub != nil {
		s.chatHub.BroadcastToConversation(uint(convID), notifications.ChatMessage{
			Type:           "message",
			ConversationID: uint(convID),
			UserID:         userID,
			Username:       message.Sender.Username,
			Payload:        message,
		})
	}

	return c.Status(fiber.StatusCreated).JSON(message)
}

// GetMessages handles GET /api/conversations/:id/messages
func (s *Server) GetMessages(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil || convID < 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)

	// Check if user is participant
	conv, err := s.chatRepo.GetConversation(ctx, uint(convID))
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

	// Auto-add user to group conversations if not already a participant
	if !isParticipant && conv.IsGroup {
		s.chatRepo.AddParticipant(ctx, uint(convID), userID)
		isParticipant = true // Trust that add succeeded
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	messages, err := s.chatRepo.GetMessages(ctx, uint(convID), limit, offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(messages)
}

// AddParticipant handles POST /api/conversations/:id/participants
func (s *Server) AddParticipant(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil || convID < 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	var req struct {
		UserID uint `json:"user_id"`
	}
	if parseErr := c.BodyParser(&req); parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Check if current user is participant and conversation is group
	conv, err := s.chatRepo.GetConversation(ctx, uint(convID))
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

	if err := s.chatRepo.AddParticipant(ctx, uint(convID), req.UserID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusOK)
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

	// Auto-add user to any group conversations they're not in
	for _, conv := range chatrooms {
		isParticipant := false
		for _, p := range conv.Participants {
			if p.ID == userID {
				isParticipant = true
				break
			}
		}
		// If user is not a participant, add them (ignore errors if already exists)
		if !isParticipant {
			// Use OnConflict to avoid duplicate key errors
			s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&models.ConversationParticipant{
				ConversationID: conv.ID,
				UserID:         userID,
			})
		}
	}

	// Re-query to get updated Participants list after auto-adding
	err = s.db.WithContext(ctx).
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
	roomID, err := c.ParamsInt("id")
	if err != nil || roomID < 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid chatroom ID"))
	}

	// Verify the conversation exists and is a group
	var conv models.Conversation
	if err := s.db.WithContext(ctx).First(&conv, roomID).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Chatroom", roomID))
	}

	if !conv.IsGroup {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Cannot join a 1-on-1 conversation"))
	}

	// Add user to the chatroom (ignore if already joined)
	err = s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&models.ConversationParticipant{
		ConversationID: uint(roomID),
		UserID:         userID,
	}).Error
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "Joined chatroom successfully"})
}
