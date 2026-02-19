package server

import (
	"time"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm/clause"
)

// ListChatroomMutes returns the list of muted users for a chatroom.
func (s *Server) ListChatroomMutes(c *fiber.Ctx) error {
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

	var mutes []models.ChatroomMute
	if err := s.db.WithContext(ctx).
		Where("conversation_id = ?", roomID).
		Preload("User").
		Preload("MutedByUser").
		Order("created_at DESC").
		Find(&mutes).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(mutes)
}

// MuteChatroomUser mutes a user in a chatroom.
func (s *Server) MuteChatroomUser(c *fiber.Ctx) error {
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
		Reason     string `json:"reason"`
		MutedUntil string `json:"muted_until"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	var mutedUntil *time.Time
	if req.MutedUntil != "" {
		parsed, err := time.Parse(time.RFC3339, req.MutedUntil)
		if err != nil {
			return models.RespondWithError(c, fiber.StatusBadRequest,
				models.NewValidationError("muted_until must be RFC3339"))
		}
		u := parsed.UTC()
		mutedUntil = &u
	}

	mute := models.ChatroomMute{
		ConversationID: roomID,
		UserID:         targetUserID,
		MutedByUserID:  actorUserID,
		Reason:         req.Reason,
		MutedUntil:     mutedUntil,
	}
	if err := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "conversation_id"}, {Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"muted_by_user_id", "reason", "muted_until", "updated_at"}),
		}).
		Create(&mute).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "User muted"})
}

// UnmuteChatroomUser removes a user's mute in a chatroom.
func (s *Server) UnmuteChatroomUser(c *fiber.Ctx) error {
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
		Delete(&models.ChatroomMute{}).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "User unmuted"})
}
