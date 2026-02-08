// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"errors"
	"strings"
	"unicode"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
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

// parsePagination extracts limit and offset query parameters with the given default limit.
func parsePagination(c *fiber.Ctx, defaultLimit int) Pagination {
	return Pagination{
		Limit:  c.QueryInt("limit", defaultLimit),
		Offset: c.QueryInt("offset", 0),
	}
}

// parseID extracts a route parameter by name as a positive uint.
// On failure it writes a 400 JSON response and returns errResponseWritten.
// Callers should check: if err != nil { return nil }
// The error message is derived from the parameter name (e.g. "id" -> "Invalid ID",
// "userId" -> "Invalid user ID", "commentId" -> "Invalid comment ID").
func (s *Server) parseID(c *fiber.Ctx, param string) (uint, error) {
	id, err := c.ParamsInt(param)
	if err != nil || id < 0 {
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
	var user models.User
	if err := s.db.WithContext(c.Context()).Select("is_admin").First(&user, userID).Error; err != nil {
		return false, err
	}
	return user.IsAdmin, nil
}
