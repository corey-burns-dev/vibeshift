package server

import (
	"strings"
	"time"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm/clause"
)

// ListChatroomBans returns the list of banned users for a chatroom.
func (s *Server) ListChatroomBans(c *fiber.Ctx) error {
	ctx := c.UserContext()
	actorUserID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	allowed, err := s.canModerateChatroomByUserID(ctx, actorUserID, roomID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !allowed {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Chatroom moderation access required"))
	}

	var bans []models.ChatroomBan
	if err := s.db.WithContext(ctx).
		Where("conversation_id = ?", roomID).
		Preload("User").
		Preload("BannedByUser").
		Order("created_at DESC").
		Find(&bans).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(bans)
}

// AddChatroomBan bans a user from a chatroom.
func (s *Server) AddChatroomBan(c *fiber.Ctx) error {
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

	allowed, err := s.canModerateChatroomByUserID(ctx, actorUserID, roomID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !allowed {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Chatroom moderation access required"))
	}

	var req struct {
		Reason string `json:"reason"`
	}
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&req); err != nil {
			return models.RespondWithError(c, fiber.StatusBadRequest,
				models.NewValidationError("Invalid request body"))
		}
	}

	ban := models.ChatroomBan{
		ConversationID: roomID,
		UserID:         targetUserID,
		BannedByUserID: actorUserID,
		Reason:         strings.TrimSpace(req.Reason),
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "conversation_id"},
			{Name: "user_id"},
		},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"banned_by_user_id": actorUserID,
			"reason":            ban.Reason,
			"updated_at":        time.Now().UTC(),
		}),
	}).Create(&ban).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Remove active participant membership immediately when banned.
	if err := s.db.WithContext(ctx).
		Where("conversation_id = ? AND user_id = ?", roomID, targetUserID).
		Delete(&models.ConversationParticipant{}).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "User banned from chatroom"})
}

// RemoveChatroomBan removes a user's ban from a chatroom.
func (s *Server) RemoveChatroomBan(c *fiber.Ctx) error {
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

	allowed, err := s.canModerateChatroomByUserID(ctx, actorUserID, roomID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !allowed {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Chatroom moderation access required"))
	}

	if err := s.db.WithContext(ctx).
		Where("conversation_id = ? AND user_id = ?", roomID, targetUserID).
		Delete(&models.ChatroomBan{}).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "User unbanned from chatroom"})
}
