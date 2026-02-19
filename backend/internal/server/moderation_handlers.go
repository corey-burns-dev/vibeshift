package server

import (
	"context"
	"errors"
	"strings"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/service"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const maxAdminUserSearchLen = 64

// GetMyBlocks returns the list of users blocked by the current user.
func (s *Server) GetMyBlocks(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	var blocks []models.UserBlock
	if err := s.db.WithContext(ctx).
		Where("blocker_id = ?", userID).
		Preload("Blocked").
		Order("created_at DESC").
		Find(&blocks).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(blocks)
}

// BlockUser blocks the target user for the current user.
func (s *Server) BlockUser(c *fiber.Ctx) error {
	ctx := c.UserContext()
	blockerID := c.Locals("userID").(uint)
	targetID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	if blockerID == targetID {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("cannot block yourself"))
	}

	var target models.User
	if err := s.db.WithContext(ctx).Select("id").First(&target, targetID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("User", targetID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	relation := models.UserBlock{BlockerID: blockerID, BlockedID: targetID}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&relation).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "User blocked"})
}

// UnblockUser removes the block of the target user.
func (s *Server) UnblockUser(c *fiber.Ctx) error {
	ctx := c.UserContext()
	blockerID := c.Locals("userID").(uint)
	targetID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	if err := s.db.WithContext(ctx).
		Where("blocker_id = ? AND blocked_id = ?", blockerID, targetID).
		Delete(&models.UserBlock{}).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "User unblocked"})
}

// ReportUser creates a moderation report for the target user.
func (s *Server) ReportUser(c *fiber.Ctx) error {
	ctx := c.UserContext()
	reporterID := c.Locals("userID").(uint)
	targetID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var req struct {
		Reason  string `json:"reason"`
		Details string `json:"details"`
	}
	if bodyErr := c.BodyParser(&req); bodyErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	var target models.User
	if dbErr := s.db.WithContext(ctx).Select("id").First(&target, targetID).Error; dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("User", targetID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, dbErr)
	}

	report, createErr := s.createModerationReport(ctx, reporterID, models.ReportTargetUser, targetID, &targetID, req.Reason, req.Details)
	if createErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, createErr)
	}

	return c.Status(fiber.StatusCreated).JSON(report)
}

// ReportPost creates a moderation report for the target post.
func (s *Server) ReportPost(c *fiber.Ctx) error {
	ctx := c.UserContext()
	reporterID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var req struct {
		Reason  string `json:"reason"`
		Details string `json:"details"`
	}
	if bodyErr := c.BodyParser(&req); bodyErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	var post models.Post
	if dbErr := s.db.WithContext(ctx).Select("id", "user_id").First(&post, postID).Error; dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("Post", postID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, dbErr)
	}

	report, createErr := s.createModerationReport(ctx, reporterID, models.ReportTargetPost, postID, &post.UserID, req.Reason, req.Details)
	if createErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, createErr)
	}

	return c.Status(fiber.StatusCreated).JSON(report)
}

// ReportMessage creates a moderation report for the target message.
func (s *Server) ReportMessage(c *fiber.Ctx) error {
	ctx := c.UserContext()
	reporterID := c.Locals("userID").(uint)
	convID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	messageID, err := s.parseID(c, "messageId")
	if err != nil {
		return nil
	}

	var req struct {
		Reason  string `json:"reason"`
		Details string `json:"details"`
	}
	if bodyErr := c.BodyParser(&req); bodyErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	if _, convErr := s.chatSvc().GetConversationForUser(ctx, convID, reporterID); convErr != nil {
		status := fiber.StatusForbidden
		if errors.Is(convErr, gorm.ErrRecordNotFound) {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, convErr)
	}

	var message models.Message
	if dbErr := s.db.WithContext(ctx).
		Select("id", "sender_id", "conversation_id").
		Where("id = ? AND conversation_id = ?", messageID, convID).
		First(&message).Error; dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("Message", messageID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, dbErr)
	}

	report, createErr := s.createModerationReport(ctx, reporterID, models.ReportTargetMessage, messageID, &message.SenderID, req.Reason, req.Details)
	if createErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, createErr)
	}

	return c.Status(fiber.StatusCreated).JSON(report)
}

// GetAdminReports handles GET /api/admin/reports.
// @Summary List moderation reports
// @Description List all moderation reports with optional filters.
// @Tags moderation-admin
// @Produce json
// @Param status query string false "Filter by status"
// @Param target_type query string false "Filter by target type"
// @Success 200 {array} models.ModerationReport
// @Failure 401 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/reports [get]
func (s *Server) GetAdminReports(c *fiber.Ctx) error {
	ctx := c.UserContext()
	status := strings.TrimSpace(c.Query("status"))
	targetType := strings.TrimSpace(c.Query("target_type"))
	page := parsePagination(c, 100)

	query := s.db.WithContext(ctx).Model(&models.ModerationReport{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if targetType != "" {
		query = query.Where("target_type = ?", targetType)
	}

	var reports []models.ModerationReport
	if err := query.
		Preload("Reporter").
		Preload("ReportedUser").
		Preload("ResolvedByUser").
		Order("created_at DESC").
		Limit(page.Limit).
		Offset(page.Offset).
		Find(&reports).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(reports)
}

// ResolveAdminReport handles POST /api/admin/reports/:id/resolve.
// @Summary Resolve moderation report
// @Description Resolve or dismiss a moderation report.
// @Tags moderation-admin
// @Accept json
// @Produce json
// @Param id path int true "Report ID"
// @Param request body object{status=string,resolution_note=string} true "Resolution details"
// @Success 200 {object} models.ModerationReport
// @Failure 400 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/reports/{id}/resolve [post]
func (s *Server) ResolveAdminReport(c *fiber.Ctx) error {
	ctx := c.UserContext()
	adminID := c.Locals("userID").(uint)
	reportID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var req struct {
		Status         string `json:"status"`
		ResolutionNote string `json:"resolution_note"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}
	status := strings.TrimSpace(strings.ToLower(req.Status))
	if status != models.ReportStatusResolved && status != models.ReportStatusDismissed {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("status must be resolved or dismissed"))
	}
	now := time.Now().UTC()
	updates := map[string]interface{}{
		"status":              status,
		"resolved_by_user_id": adminID,
		"resolved_at":         now,
		"resolution_note":     strings.TrimSpace(req.ResolutionNote),
	}
	if err := s.db.WithContext(ctx).
		Model(&models.ModerationReport{}).
		Where("id = ?", reportID).
		Updates(updates).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	var report models.ModerationReport
	if err := s.db.WithContext(ctx).
		Preload("Reporter").
		Preload("ReportedUser").
		Preload("ResolvedByUser").
		First(&report, reportID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("ModerationReport", reportID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(report)
}

func (s *Server) moderationSvc() *service.ModerationService {
	return s.moderationService
}

// GetAdminBanRequests handles GET /api/admin/ban-requests.
// @Summary List ban requests
// @Description List all ban requests.
// @Tags moderation-admin
// @Produce json
// @Success 200 {array} service.BanRequestRow
// @Failure 401 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/ban-requests [get]
func (s *Server) GetAdminBanRequests(c *fiber.Ctx) error {
	ctx := c.UserContext()
	page := parsePagination(c, 100)

	rows, err := s.moderationSvc().GetAdminBanRequests(ctx, page.Limit, page.Offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(rows)
}

// GetAdminUsers handles GET /api/admin/users.
// @Summary List users for admin
// @Description List users with search and pagination.
// @Tags moderation-admin
// @Produce json
// @Param q query string false "Search query (username or email)"
// @Success 200 {array} models.User
// @Failure 401 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/users [get]
func (s *Server) GetAdminUsers(c *fiber.Ctx) error {
	ctx := c.UserContext()
	page := parsePagination(c, 100)
	q := strings.TrimSpace(c.Query("q"))

	if len(q) > maxAdminUserSearchLen {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Search query too long (max 64 characters)"))
	}

	query := s.db.WithContext(ctx).Model(&models.User{})
	if q != "" {
		like := "%" + strings.ToLower(q) + "%"
		query = query.Where("LOWER(username) LIKE ? OR LOWER(email) LIKE ?", like, like)
	}

	var users []models.User
	if err := query.Order("id ASC").Limit(page.Limit).Offset(page.Offset).Find(&users).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	return c.JSON(users)
}

// GetAdminUserDetail handles GET /api/admin/users/:id.
// @Summary Get user detail for admin
// @Description Fetch detailed information about a user for moderation.
// @Tags moderation-admin
// @Produce json
// @Param id path int true "User ID"
// @Success 200 {object} service.AdminUserDetail
// @Failure 401 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/users/{id} [get]
func (s *Server) GetAdminUserDetail(c *fiber.Ctx) error {
	ctx := c.UserContext()
	targetID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	detail, err := s.moderationSvc().GetAdminUserDetail(ctx, targetID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("User", targetID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(detail)
}

// BanUser handles POST /api/admin/users/:id/ban.
// @Summary Ban a user
// @Description Ban a user from the platform.
// @Tags moderation-admin
// @Accept json
// @Produce json
// @Param id path int true "User ID"
// @Param request body object{reason=string} true "Ban reason"
// @Success 200 {object} object{message=string}
// @Failure 400 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/users/{id}/ban [post]
func (s *Server) BanUser(c *fiber.Ctx) error {
	ctx := c.UserContext()
	adminID := c.Locals("userID").(uint)
	targetID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	if adminID == targetID {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("cannot ban yourself"))
	}

	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}
	now := time.Now().UTC()
	updates := map[string]interface{}{
		"is_banned":         true,
		"banned_at":         now,
		"banned_reason":     strings.TrimSpace(req.Reason),
		"banned_by_user_id": adminID,
	}
	if err := s.db.WithContext(ctx).
		Model(&models.User{}).
		Where("id = ?", targetID).
		Updates(updates).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "User banned"})
}

// UnbanUser handles POST /api/admin/users/:id/unban.
// @Summary Unban a user
// @Description Remove ban from a user.
// @Tags moderation-admin
// @Produce json
// @Param id path int true "User ID"
// @Success 200 {object} object{message=string}
// @Failure 400 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/users/{id}/unban [post]
func (s *Server) UnbanUser(c *fiber.Ctx) error {
	ctx := c.UserContext()
	targetID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	updates := map[string]interface{}{
		"is_banned":         false,
		"banned_at":         nil,
		"banned_reason":     "",
		"banned_by_user_id": nil,
	}
	if err := s.db.WithContext(ctx).
		Model(&models.User{}).
		Where("id = ?", targetID).
		Updates(updates).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(fiber.Map{"message": "User unbanned"})
}

func (s *Server) createModerationReport(
	ctx context.Context,
	reporterID uint,
	targetType string,
	targetID uint,
	reportedUserID *uint,
	reason string,
	details string,
) (*models.ModerationReport, error) {
	reason = strings.TrimSpace(reason)
	details = strings.TrimSpace(details)
	if reason == "" {
		return nil, models.NewValidationError("reason is required")
	}

	report := &models.ModerationReport{
		ReporterID:     reporterID,
		TargetType:     targetType,
		TargetID:       targetID,
		ReportedUserID: reportedUserID,
		Reason:         reason,
		Details:        details,
		Status:         models.ReportStatusOpen,
	}
	if err := s.db.WithContext(ctx).Create(report).Error; err != nil {
		return nil, err
	}
	s.publishAdminEvent("moderation_report_created", map[string]interface{}{
		"id":               report.ID,
		"target_type":      report.TargetType,
		"target_id":        report.TargetID,
		"reported_user_id": report.ReportedUserID,
		"status":           report.Status,
		"created_at":       report.CreatedAt.UTC().Format(time.RFC3339Nano),
	})

	return report, nil
}
