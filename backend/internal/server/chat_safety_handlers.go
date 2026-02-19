package server

import (
	"context"
	"errors"
	"sort"
	"strings"

	"sanctum/internal/models"
	"sanctum/internal/notifications"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MessageReactionSummary is the API shape for reaction counts on a message.
type MessageReactionSummary struct {
	Emoji       string `json:"emoji"`
	Count       int    `json:"count"`
	ReactedByMe bool   `json:"reacted_by_me"`
}

// AddMessageReaction adds an emoji reaction to a message.
func (s *Server) AddMessageReaction(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	messageID, err := s.parseID(c, "messageId")
	if err != nil {
		return nil
	}

	var req struct {
		Emoji string `json:"emoji"`
	}
	if bodyErr := c.BodyParser(&req); bodyErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}
	emoji := strings.TrimSpace(req.Emoji)
	if emoji == "" || len(emoji) > 32 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("emoji is required"))
	}

	if _, convErr := s.chatSvc().GetConversationForUser(ctx, convID, userID); convErr != nil {
		status := fiber.StatusForbidden
		if errors.Is(convErr, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, convErr)
	}

	var message models.Message
	if dbErr := s.db.WithContext(ctx).
		Select("id", "conversation_id").
		Where("id = ? AND conversation_id = ?", messageID, convID).
		First(&message).Error; dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("Message", messageID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, dbErr)
	}

	reaction := models.MessageReaction{MessageID: messageID, UserID: userID, Emoji: emoji}
	if createErr := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&reaction).Error; createErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, createErr)
	}

	summary, err := s.getMessageReactionSummary(ctx, messageID, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	if s.chatHub != nil {
		s.chatHub.BroadcastToConversation(convID, notifications.ChatMessage{
			Type:           "message_reaction_updated",
			ConversationID: convID,
			UserID:         userID,
			Payload: map[string]interface{}{
				"conversation_id": convID,
				"message_id":      messageID,
				"reactions":       summary,
			},
		})
	}

	return c.JSON(fiber.Map{
		"conversation_id": convID,
		"message_id":      messageID,
		"reactions":       summary,
	})
}

// RemoveMessageReaction removes an emoji reaction from a message.
func (s *Server) RemoveMessageReaction(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	messageID, err := s.parseID(c, "messageId")
	if err != nil {
		return nil
	}
	emoji := strings.TrimSpace(c.Query("emoji"))
	if emoji == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("emoji query parameter is required"))
	}

	if _, convErr := s.chatSvc().GetConversationForUser(ctx, convID, userID); convErr != nil {
		status := fiber.StatusForbidden
		if errors.Is(convErr, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, convErr)
	}

	if deleteErr := s.db.WithContext(ctx).
		Where("message_id = ? AND user_id = ? AND emoji = ?", messageID, userID, emoji).
		Delete(&models.MessageReaction{}).Error; deleteErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, deleteErr)
	}

	summary, summaryErr := s.getMessageReactionSummary(ctx, messageID, userID)
	if summaryErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, summaryErr)
	}

	if s.chatHub != nil {
		s.chatHub.BroadcastToConversation(convID, notifications.ChatMessage{
			Type:           "message_reaction_updated",
			ConversationID: convID,
			UserID:         userID,
			Payload: map[string]interface{}{
				"conversation_id": convID,
				"message_id":      messageID,
				"reactions":       summary,
			},
		})
	}

	return c.JSON(fiber.Map{
		"conversation_id": convID,
		"message_id":      messageID,
		"reactions":       summary,
	})
}

// GetMyMentions returns mentions of the current user across messages.
func (s *Server) GetMyMentions(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	page := parsePagination(c, 50)

	var mentions []models.MessageMention
	if err := s.db.WithContext(ctx).
		Where("mentioned_user_id = ?", userID).
		Preload("Message").
		Preload("Message.Sender").
		Preload("Conversation").
		Order("created_at DESC").
		Limit(page.Limit).
		Offset(page.Offset).
		Find(&mentions).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(mentions)
}

func (s *Server) getMessageReactionSummary(ctx context.Context, messageID, currentUserID uint) ([]MessageReactionSummary, error) {
	var reactions []models.MessageReaction
	if err := s.db.WithContext(ctx).Where("message_id = ?", messageID).Find(&reactions).Error; err != nil {
		return nil, err
	}
	if len(reactions) == 0 {
		return []MessageReactionSummary{}, nil
	}

	type aggregate struct {
		count int
		mine  bool
	}
	agg := make(map[string]aggregate)
	for _, reaction := range reactions {
		entry := agg[reaction.Emoji]
		entry.count++
		if reaction.UserID == currentUserID {
			entry.mine = true
		}
		agg[reaction.Emoji] = entry
	}

	summary := make([]MessageReactionSummary, 0, len(agg))
	for emoji, entry := range agg {
		summary = append(summary, MessageReactionSummary{
			Emoji:       emoji,
			Count:       entry.count,
			ReactedByMe: entry.mine,
		})
	}
	sort.Slice(summary, func(i, j int) bool {
		if summary[i].Count == summary[j].Count {
			return summary[i].Emoji < summary[j].Emoji
		}
		return summary[i].Count > summary[j].Count
	})

	return summary, nil
}
