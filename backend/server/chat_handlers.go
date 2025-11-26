package server

import (
	"encoding/json"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
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
	if err := c.BodyParser(&req); err != nil {
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

	return c.JSON(conversations)
}

// GetConversation handles GET /api/conversations/:id
func (s *Server) GetConversation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil {
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
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	var req struct {
		Content     string `json:"content"`
		MessageType string `json:"message_type,omitempty"`
		Metadata    string `json:"metadata,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
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

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
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
	message.Sender, _ = s.userRepo.GetByID(ctx, userID)

	// Broadcast message to all participants via Redis pub/sub
	if s.notifier != nil {
		messageJSON, err := json.Marshal(map[string]interface{}{
			"type":            "message",
			"conversation_id": uint(convID),
			"user_id":         userID,
			"username":        message.Sender.Username,
			"payload":         message,
		})
		if err == nil {
			_ = s.notifier.PublishChatMessage(ctx, uint(convID), string(messageJSON))
		}
	}

	return c.Status(fiber.StatusCreated).JSON(message)
}

// GetMessages handles GET /api/conversations/:id/messages
func (s *Server) GetMessages(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil {
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
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	var req struct {
		UserID uint `json:"user_id"`
	}
	if err := c.BodyParser(&req); err != nil {
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
