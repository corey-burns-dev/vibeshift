package server

import (
	"context"
	"errors"
	"strings"
	"time"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SanctumAdminDTO struct {
	UserID    uint                         `json:"user_id"`
	Username  string                       `json:"username"`
	Email     string                       `json:"email"`
	Role      models.SanctumMembershipRole `json:"role"`
	CreatedAt string                       `json:"created_at"`
	UpdatedAt string                       `json:"updated_at"`
}

func toSanctumAdminDTO(m models.SanctumMembership) SanctumAdminDTO {
	username := ""
	email := ""
	if m.User != nil {
		username = m.User.Username
		email = m.User.Email
	}
	return SanctumAdminDTO{
		UserID:    m.UserID,
		Username:  username,
		Email:     email,
		Role:      m.Role,
		CreatedAt: m.CreatedAt.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: m.UpdatedAt.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func (s *Server) findSanctumBySlug(ctx context.Context, slug string) (*models.Sanctum, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, models.NewValidationError("slug is required")
	}

	var sanctum models.Sanctum
	if err := s.db.WithContext(ctx).Where("slug = ?", slug).First(&sanctum).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.NewNotFoundError("Sanctum", slug)
		}
		return nil, err
	}
	return &sanctum, nil
}

// GetSanctumAdmins handles GET /api/sanctums/:slug/admins.
// @Summary List sanctum admins
// @Description List owners and moderators for a sanctum.
// @Tags sanctums-admin
// @Produce json
// @Param slug path string true "Sanctum slug"
// @Success 200 {array} SanctumAdminDTO
// @Failure 400 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /sanctums/{slug}/admins [get]
func (s *Server) GetSanctumAdmins(c *fiber.Ctx) error {
	ctx := c.UserContext()
	actorUserID := c.Locals("userID").(uint)

	sanctum, err := s.findSanctumBySlug(ctx, c.Params("slug"))
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "VALIDATION_ERROR":
				status = fiber.StatusBadRequest
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			}
		}
		return models.RespondWithError(c, status, err)
	}

	authorized, err := s.canManageSanctumAsOwnerByUserID(ctx, actorUserID, sanctum.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !authorized {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Sanctum owner or master admin access required"))
	}

	var memberships []models.SanctumMembership
	if err := s.db.WithContext(ctx).
		Preload("User").
		Where("sanctum_id = ? AND role IN ?", sanctum.ID, []models.SanctumMembershipRole{
			models.SanctumMembershipRoleOwner,
			models.SanctumMembershipRoleMod,
		}).
		Order("created_at ASC").
		Find(&memberships).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	resp := make([]SanctumAdminDTO, 0, len(memberships))
	for _, membership := range memberships {
		resp = append(resp, toSanctumAdminDTO(membership))
	}

	return c.JSON(resp)
}

// PromoteSanctumAdmin handles POST /api/sanctums/:slug/admins/:userId.
// @Summary Promote user to sanctum admin
// @Description Promote a user to moderator role in a sanctum.
// @Tags sanctums-admin
// @Produce json
// @Param slug path string true "Sanctum slug"
// @Param userId path int true "User ID"
// @Success 200 {object} SanctumAdminDTO
// @Failure 400 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /sanctums/{slug}/admins/{userId} [post]
func (s *Server) PromoteSanctumAdmin(c *fiber.Ctx) error {
	ctx := c.UserContext()
	actorUserID := c.Locals("userID").(uint)
	targetUserID, err := s.parseID(c, "userId")
	if err != nil {
		return nil
	}

	sanctum, err := s.findSanctumBySlug(ctx, c.Params("slug"))
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "VALIDATION_ERROR":
				status = fiber.StatusBadRequest
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			}
		}
		return models.RespondWithError(c, status, err)
	}

	authorized, err := s.canManageSanctumAsOwnerByUserID(ctx, actorUserID, sanctum.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !authorized {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Sanctum owner or master admin access required"))
	}

	var user models.User
	if err := s.db.WithContext(ctx).Select("id").First(&user, targetUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("User", targetUserID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	membership := models.SanctumMembership{
		SanctumID: sanctum.ID,
		UserID:    targetUserID,
		Role:      models.SanctumMembershipRoleMod,
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "sanctum_id"},
			{Name: "user_id"},
		},
		DoUpdates: clause.Assignments(map[string]any{
			"role":       models.SanctumMembershipRoleMod,
			"updated_at": time.Now(),
		}),
	}).Create(&membership).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	var updated models.SanctumMembership
	if err := s.db.WithContext(ctx).
		Preload("User").
		Where("sanctum_id = ? AND user_id = ?", sanctum.ID, targetUserID).
		First(&updated).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(toSanctumAdminDTO(updated))
}

// DemoteSanctumAdmin handles DELETE /api/sanctums/:slug/admins/:userId.
// @Summary Demote sanctum admin
// @Description Demote a moderator back to member role in a sanctum.
// @Tags sanctums-admin
// @Produce json
// @Param slug path string true "Sanctum slug"
// @Param userId path int true "User ID"
// @Success 200 {object} SanctumAdminDTO
// @Failure 400 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /sanctums/{slug}/admins/{userId} [delete]
func (s *Server) DemoteSanctumAdmin(c *fiber.Ctx) error {
	ctx := c.UserContext()
	actorUserID := c.Locals("userID").(uint)
	targetUserID, err := s.parseID(c, "userId")
	if err != nil {
		return nil
	}

	sanctum, err := s.findSanctumBySlug(ctx, c.Params("slug"))
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "VALIDATION_ERROR":
				status = fiber.StatusBadRequest
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			}
		}
		return models.RespondWithError(c, status, err)
	}

	authorized, err := s.canManageSanctumAsOwnerByUserID(ctx, actorUserID, sanctum.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !authorized {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Sanctum owner or master admin access required"))
	}

	var membership models.SanctumMembership
	if err := s.db.WithContext(ctx).
		Where("sanctum_id = ? AND user_id = ?", sanctum.ID, targetUserID).
		First(&membership).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("Sanctum membership", targetUserID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	if membership.Role == models.SanctumMembershipRoleOwner {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("cannot demote sanctum owner"))
	}

	if err := s.db.WithContext(ctx).
		Model(&models.SanctumMembership{}).
		Where("sanctum_id = ? AND user_id = ?", sanctum.ID, targetUserID).
		Updates(map[string]any{
			"role":       models.SanctumMembershipRoleMember,
			"updated_at": time.Now(),
		}).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	var updated models.SanctumMembership
	if err := s.db.WithContext(ctx).
		Preload("User").
		Where("sanctum_id = ? AND user_id = ?", sanctum.ID, targetUserID).
		First(&updated).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(toSanctumAdminDTO(updated))
}
