// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"errors"
	"strings"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/service"

	"github.com/gofiber/fiber/v2"
)

// SearchUsers handles GET /api/users/search?q=...
func (s *Server) SearchUsers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	q := strings.TrimSpace(c.Query("q"))
	page := parsePagination(c, 20)

	users, err := s.userSvc().SearchUsers(ctx, q, page.Limit, page.Offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(users)
}

// GetAllUsers handles GET /api/users
func (s *Server) GetAllUsers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	page := parsePagination(c, 100)

	users, err := s.userSvc().ListUsers(ctx, page.Limit, page.Offset)
	if err != nil {
		// Check for timeout
		if errors.Is(err, context.DeadlineExceeded) {
			return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{
				"error": "Request timeout",
			})
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(users)
}

// GetUserProfile handles GET /api/users/:id
func (s *Server) GetUserProfile(c *fiber.Ctx) error {
	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	user, err := s.userSvc().GetUserByID(c.Context(), id)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	return c.JSON(user)
}

// GetMyProfile handles GET /api/users/me
func (s *Server) GetMyProfile(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	user, err := s.userSvc().GetUserByID(c.Context(), userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	return c.JSON(user)
}

// UpdateMyProfile handles PUT /api/users/me
func (s *Server) UpdateMyProfile(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var req struct {
		Username string `json:"username"`
		Bio      string `json:"bio"`
		Avatar   string `json:"avatar"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	user, err := s.userSvc().UpdateProfile(ctx, service.UpdateProfileInput{
		UserID:   userID,
		Username: req.Username,
		Bio:      req.Bio,
		Avatar:   req.Avatar,
	})
	if err != nil {
		return models.RespondWithError(c, mapServiceError(err), err)
	}

	return c.JSON(user)
}

// PromoteToAdmin handles POST /api/users/:id/promote-admin (admin only)
// Admin check is enforced by AdminRequired middleware on the route.
func (s *Server) PromoteToAdmin(c *fiber.Ctx) error {
	ctx := c.Context()
	targetID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	target, err := s.userSvc().SetAdmin(ctx, targetID, true)
	if err != nil {
		return models.RespondWithError(c, mapServiceError(err), err)
	}

	return c.JSON(fiber.Map{"message": "User promoted to admin", "user": target})
}

// DemoteFromAdmin handles POST /api/users/:id/demote-admin (admin only)
// Admin check is enforced by AdminRequired middleware on the route.
func (s *Server) DemoteFromAdmin(c *fiber.Ctx) error {
	ctx := c.Context()
	targetID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	if strings.EqualFold(s.config.Env, "development") && targetID == 1 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("cannot demote protected development root admin user"))
	}

	target, err := s.userSvc().SetAdmin(ctx, targetID, false)
	if err != nil {
		return models.RespondWithError(c, mapServiceError(err), err)
	}

	return c.JSON(fiber.Map{"message": "User demoted from admin", "user": target})
}

func (s *Server) userSvc() *service.UserService {
	if s.userService == nil {
		s.userService = service.NewUserService(s.userRepo)
	}
	return s.userService
}
