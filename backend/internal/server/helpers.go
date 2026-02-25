// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"errors"
	"strings"
	"unicode"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// errResponseWritten is a sentinel indicating the HTTP response was already
// committed by a helper.  Handlers must return nil (not this error) to avoid
// Fiber's ErrorHandler overwriting the response.
var errResponseWritten = errors.New("response already written")

// Pagination holds parsed limit/offset query parameters.
type Pagination struct {
	Limit  int
	Offset int
}

const (
	maxPaginationLimit = 100
)

// mapServiceError returns the HTTP status code for a service-layer error.
func mapServiceError(err error) int {
	var appErr *models.AppError
	if errors.As(err, &appErr) {
		switch appErr.Code {
		case "VALIDATION_ERROR":
			return fiber.StatusBadRequest
		case "UNAUTHORIZED":
			return fiber.StatusForbidden
		case "FORBIDDEN":
			return fiber.StatusForbidden
		case "NOT_FOUND":
			return fiber.StatusNotFound
		case "CONFLICT":
			return fiber.StatusConflict
		}
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return fiber.StatusNotFound
	}
	return fiber.StatusInternalServerError
}

// parsePagination extracts limit and offset query parameters with the given default limit.
func parsePagination(c *fiber.Ctx, defaultLimit int) Pagination {
	limit := c.QueryInt("limit", defaultLimit)
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxPaginationLimit {
		limit = maxPaginationLimit
	}

	offset := c.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}

	return Pagination{
		Limit:  limit,
		Offset: offset,
	}
}

// parseID extracts a route parameter by name as a positive uint.
// On failure it writes a 400 JSON response and returns errResponseWritten.
// Callers should check: if err != nil { return nil }
// The error message is derived from the parameter name (e.g. "id" -> "Invalid ID",
// "userId" -> "Invalid user ID", "commentId" -> "Invalid comment ID").
func (s *Server) parseID(c *fiber.Ctx, param string) (uint, error) {
	id, err := c.ParamsInt(param)
	if err != nil || id <= 0 {
		_ = models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid "+humanizeParam(param)))
		return 0, errResponseWritten
	}
	return uint(id), nil
}

// humanizeParam converts a route param name into a human-readable label.
// Examples: "id" -> "ID", "userId" -> "user ID", "commentId" -> "comment ID".
func humanizeParam(param string) string {
	if param == "id" {
		return "ID"
	}
	// Split on camelCase boundary before the trailing "Id" suffix.
	if strings.HasSuffix(param, "Id") {
		prefix := param[:len(param)-2]
		// Split camelCase prefix into words.
		words := splitCamel(prefix)
		return strings.ToLower(strings.Join(words, " ")) + " ID"
	}
	return param
}

// splitCamel splits a camelCase string into words.
func splitCamel(s string) []string {
	var words []string
	start := 0
	for i, r := range s {
		if i > 0 && unicode.IsUpper(r) {
			words = append(words, s[start:i])
			start = i
		}
	}
	words = append(words, s[start:])
	return words
}

// isAdmin checks whether the given user has admin privileges.
func (s *Server) isAdmin(c *fiber.Ctx, userID uint) (bool, error) {
	return s.isAdminByUserID(c.Context(), userID)
}

func (s *Server) isAdminByUserID(ctx context.Context, userID uint) (bool, error) {
	var user models.User
	if err := s.db.WithContext(ctx).Select("is_admin").First(&user, userID).Error; err != nil {
		return false, err
	}
	return user.IsAdmin, nil
}

func (s *Server) isBannedByUserID(ctx context.Context, userID uint) (bool, error) {
	if s.db == nil {
		return false, nil
	}
	var user models.User
	if err := s.db.WithContext(ctx).Select("is_banned").First(&user, userID).Error; err != nil {
		if models.IsSchemaMissingError(err) {
			return false, nil
		}
		return false, err
	}
	return user.IsBanned, nil
}

func (s *Server) getSanctumRoleByUserID(ctx context.Context, userID, sanctumID uint) (models.SanctumMembershipRole, bool, error) {
	var membership models.SanctumMembership
	err := s.db.WithContext(ctx).
		Select("role").
		Where("sanctum_id = ? AND user_id = ?", sanctumID, userID).
		First(&membership).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return membership.Role, true, nil
}

func (s *Server) canManageSanctumByUserID(ctx context.Context, userID, sanctumID uint) (bool, error) {
	master, err := s.isAdminByUserID(ctx, userID)
	if err != nil {
		return false, err
	}
	if master {
		return true, nil
	}

	role, found, err := s.getSanctumRoleByUserID(ctx, userID, sanctumID)
	if err != nil || !found {
		return false, err
	}

	return role == models.SanctumMembershipRoleOwner || role == models.SanctumMembershipRoleMod, nil
}

func (s *Server) canManageSanctumAsOwnerByUserID(ctx context.Context, userID, sanctumID uint) (bool, error) {
	master, err := s.isAdminByUserID(ctx, userID)
	if err != nil {
		return false, err
	}
	if master {
		return true, nil
	}

	role, found, err := s.getSanctumRoleByUserID(ctx, userID, sanctumID)
	if err != nil || !found {
		return false, err
	}
	return role == models.SanctumMembershipRoleOwner, nil
}

func (s *Server) isChatroomModeratorByUserID(ctx context.Context, userID, roomID uint) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&models.ChatroomModerator{}).
		Where("conversation_id = ? AND user_id = ?", roomID, userID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Server) canManageChatroomModeratorsByUserID(ctx context.Context, userID, roomID uint) (bool, error) {
	master, err := s.isAdminByUserID(ctx, userID)
	if err != nil {
		return false, err
	}
	if master {
		return true, nil
	}

	var conv models.Conversation
	if dbErr := s.db.WithContext(ctx).
		Select("id", "sanctum_id").
		First(&conv, roomID).Error; dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, dbErr
	}
	if conv.SanctumID == nil {
		return false, nil
	}

	return s.canManageSanctumByUserID(ctx, userID, *conv.SanctumID)
}

func (s *Server) canModerateChatroomByUserID(ctx context.Context, userID, roomID uint) (bool, error) {
	master, err := s.isAdminByUserID(ctx, userID)
	if err != nil {
		return false, err
	}
	if master {
		return true, nil
	}

	var conv models.Conversation
	if dbErr := s.db.WithContext(ctx).
		Select("id", "sanctum_id", "created_by").
		First(&conv, roomID).Error; dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, dbErr
	}

	if conv.SanctumID != nil {
		canManage, manageErr := s.canManageSanctumByUserID(ctx, userID, *conv.SanctumID)
		if manageErr != nil {
			return false, manageErr
		}
		if canManage {
			return true, nil
		}
	}

	isRoomMod, err := s.isChatroomModeratorByUserID(ctx, userID, roomID)
	if err != nil {
		return false, err
	}
	if isRoomMod {
		return true, nil
	}

	// Legacy non-sanctum room creator moderation capability.
	if conv.SanctumID == nil && conv.CreatedBy == userID {
		return true, nil
	}

	return false, nil
}
