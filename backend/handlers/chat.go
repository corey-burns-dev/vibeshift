package handlers

import (
	"strconv"
	"time"
	"vibeshift/database"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// GetConversations returns all conversations for the authenticated user
func GetConversations(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	var conversations []models.Conversation
	err := database.DB.
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Limit(1) // Get last message
		}).
		Joins("JOIN conversation_participants ON conversation_participants.conversation_id = conversations.id").
		Where("conversation_participants.user_id = ?", userID).
		Order("conversations.updated_at DESC").
		Find(&conversations).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch conversations",
		})
	}

	return c.JSON(conversations)
}

// GetConversation returns a single conversation with messages
func GetConversation(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	conversationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid conversation ID",
		})
	}

	// Verify user is a participant
	var count int64
	database.DB.Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		Count(&count)

	if count == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You are not a participant in this conversation",
		})
	}

	var conversation models.Conversation
	err = database.DB.
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Preload("Sender").Order("created_at ASC")
		}).
		First(&conversation, conversationID).Error

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Conversation not found",
		})
	}

	// Update last read timestamp
	database.DB.Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		Update("last_read_at", time.Now())

	return c.JSON(conversation)
}

// CreateConversation creates a new conversation (1-on-1 or group)
func CreateConversation(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	var req struct {
		ParticipantIDs []uint `json:"participant_ids" validate:"required,min=1"`
		Name           string `json:"name"`
		IsGroup        bool   `json:"is_group"`
		Avatar         string `json:"avatar"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// For 1-on-1 chats, check if conversation already exists
	if !req.IsGroup && len(req.ParticipantIDs) == 1 {
		var existingConv models.Conversation
		err := database.DB.
			Joins("JOIN conversation_participants cp1 ON cp1.conversation_id = conversations.id").
			Joins("JOIN conversation_participants cp2 ON cp2.conversation_id = conversations.id").
			Where("conversations.is_group = ? AND cp1.user_id = ? AND cp2.user_id = ?",
				false, userID, req.ParticipantIDs[0]).
			First(&existingConv).Error

		if err == nil {
			// Conversation already exists
			return c.JSON(existingConv)
		}
	}

	// Create new conversation
	conversation := models.Conversation{
		Name:      req.Name,
		IsGroup:   req.IsGroup,
		Avatar:    req.Avatar,
		CreatedBy: userID,
	}

	if err := database.DB.Create(&conversation).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create conversation",
		})
	}

	// Add creator as participant
	allParticipants := append(req.ParticipantIDs, userID)
	uniqueParticipants := make(map[uint]bool)
	for _, id := range allParticipants {
		uniqueParticipants[id] = true
	}

	for participantID := range uniqueParticipants {
		participant := models.ConversationParticipant{
			ConversationID: conversation.ID,
			UserID:         participantID,
			LastReadAt:     time.Now(),
		}
		database.DB.Create(&participant)
	}

	// Load participants for response
	database.DB.Preload("Participants").First(&conversation, conversation.ID)

	return c.Status(fiber.StatusCreated).JSON(conversation)
}

// SendMessage sends a message in a conversation
func SendMessage(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	conversationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid conversation ID",
		})
	}

	var req struct {
		Content     string `json:"content" validate:"required"`
		MessageType string `json:"message_type"`
		Metadata    string `json:"metadata"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Verify user is a participant
	var count int64
	database.DB.Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		Count(&count)

	if count == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You are not a participant in this conversation",
		})
	}

	// Set default message type
	if req.MessageType == "" {
		req.MessageType = "text"
	}

	// Create message
	message := models.Message{
		ConversationID: uint(conversationID),
		SenderID:       userID,
		Content:        req.Content,
		MessageType:    req.MessageType,
		Metadata:       req.Metadata,
	}

	if err := database.DB.Create(&message).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to send message",
		})
	}

	// Update conversation's updated_at timestamp
	database.DB.Model(&models.Conversation{}).
		Where("id = ?", conversationID).
		Update("updated_at", time.Now())

	// Load sender info
	database.DB.Preload("Sender").First(&message, message.ID)

	return c.Status(fiber.StatusCreated).JSON(message)
}

// GetMessages returns paginated messages for a conversation
func GetMessages(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	conversationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid conversation ID",
		})
	}

	// Verify user is a participant
	var count int64
	database.DB.Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		Count(&count)

	if count == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You are not a participant in this conversation",
		})
	}

	// Pagination
	limit := 50
	if limitParam := c.Query("limit"); limitParam != "" {
		if l, err := strconv.Atoi(limitParam); err == nil && l > 0 {
			limit = l
		}
	}

	offset := 0
	if offsetParam := c.Query("offset"); offsetParam != "" {
		if o, err := strconv.Atoi(offsetParam); err == nil && o >= 0 {
			offset = o
		}
	}

	var messages []models.Message
	err = database.DB.
		Preload("Sender").
		Where("conversation_id = ?", conversationID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&messages).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch messages",
		})
	}

	return c.JSON(messages)
}

// DeleteMessage deletes a message (soft delete)
func DeleteMessage(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	messageID, err := strconv.Atoi(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid message ID",
		})
	}

	// Find message and verify sender
	var message models.Message
	err = database.DB.First(&message, messageID).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Message not found",
		})
	}

	if message.SenderID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You can only delete your own messages",
		})
	}

	// Soft delete
	if err := database.DB.Delete(&message).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete message",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Message deleted successfully",
	})
}

// MarkAsRead marks all messages in a conversation as read for the current user
func MarkAsRead(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	conversationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid conversation ID",
		})
	}

	// Update last read timestamp
	result := database.DB.Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		Update("last_read_at", time.Now())

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to mark as read",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Marked as read",
	})
}

// AddParticipants adds users to a group conversation
func AddParticipants(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	conversationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid conversation ID",
		})
	}

	var req struct {
		UserIDs []uint `json:"user_ids" validate:"required,min=1"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Verify conversation exists and is a group
	var conversation models.Conversation
	err = database.DB.First(&conversation, conversationID).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Conversation not found",
		})
	}

	if !conversation.IsGroup {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Can only add participants to group conversations",
		})
	}

	// Verify user is a participant or creator
	var count int64
	database.DB.Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		Count(&count)

	if count == 0 && conversation.CreatedBy != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You don't have permission to add participants",
		})
	}

	// Add new participants
	for _, newUserID := range req.UserIDs {
		participant := models.ConversationParticipant{
			ConversationID: uint(conversationID),
			UserID:         newUserID,
			LastReadAt:     time.Now(),
		}
		database.DB.Create(&participant)
	}

	return c.JSON(fiber.Map{
		"message": "Participants added successfully",
	})
}

// RemoveParticipant removes a user from a group conversation
func RemoveParticipant(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	conversationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid conversation ID",
		})
	}

	participantID, err := strconv.Atoi(c.Params("participantId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid participant ID",
		})
	}

	// Verify conversation exists and is a group
	var conversation models.Conversation
	err = database.DB.First(&conversation, conversationID).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Conversation not found",
		})
	}

	if !conversation.IsGroup {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Can only remove participants from group conversations",
		})
	}

	// Check if user is creator or removing themselves
	if conversation.CreatedBy != userID && uint(participantID) != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You don't have permission to remove this participant",
		})
	}

	// Remove participant
	result := database.DB.
		Where("conversation_id = ? AND user_id = ?", conversationID, participantID).
		Delete(&models.ConversationParticipant{})

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to remove participant",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Participant removed successfully",
	})
}
