// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"errors"
	"time"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
)

// GetAllUsers handles GET /api/users
func (s *Server) GetAllUsers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	limit := c.QueryInt("limit", 100)
	offset := c.QueryInt("offset", 0)

	users, err := s.userRepo.List(ctx, limit, offset)
	if err != nil {
		// Check for timeout
		if errors.Is(err, context.DeadlineExceeded) {
			return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{
				"error": "Request timeout",
			})
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Hide passwords
	for i := range users {
		users[i].Password = ""
	}

	return c.JSON(users)
}

// GetUserProfile handles GET /api/users/:id
func (s *Server) GetUserProfile(c *fiber.Ctx) error {
	ctx := c.Context()
	id, err := c.ParamsInt("id")
	if err != nil || id < 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	user, err := s.userRepo.GetByID(ctx, uint(id))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Hide password
	user.Password = ""
	return c.JSON(user)
}

// GetMyProfile handles GET /api/users/me
func (s *Server) GetMyProfile(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Hide password
	user.Password = ""
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

	// Get current user
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Update fields if provided
	if req.Username != "" {
		user.Username = req.Username
	}
	if req.Bio != "" {
		user.Bio = req.Bio
	}
	if req.Avatar != "" {
		user.Avatar = req.Avatar
	}

	// Save updated user
	if err := s.userRepo.Update(ctx, user); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Hide password before returning
	user.Password = ""
	return c.JSON(user)
}

// PromoteToAdmin handles POST /api/users/:id/promote-admin (admin only)
func (s *Server) PromoteToAdmin(c *fiber.Ctx) error {
	ctx := c.Context()
	requesterID := c.Locals("userID").(uint)
	targetID, err := c.ParamsInt("id")
	if err != nil || targetID < 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	// Check if requester is admin
	var requester models.User
	if err := s.db.WithContext(ctx).First(&requester, requesterID).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	if !requester.IsAdmin {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Only admins can promote users to admin"))
	}

	// Get target user
	var target models.User
	if err := s.db.WithContext(ctx).First(&target, targetID).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Promote user
	target.IsAdmin = true
	if err := s.db.WithContext(ctx).Save(&target).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	target.Password = ""
	return c.JSON(fiber.Map{"message": "User promoted to admin", "user": target})
}

// DemoteFromAdmin handles POST /api/users/:id/demote-admin (admin only)
func (s *Server) DemoteFromAdmin(c *fiber.Ctx) error {
	ctx := c.Context()
	requesterID := c.Locals("userID").(uint)
	targetID, err := c.ParamsInt("id")
	if err != nil || targetID < 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	// Check if requester is admin
	var requester models.User
	if err := s.db.WithContext(ctx).First(&requester, requesterID).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	if !requester.IsAdmin {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("Only admins can demote users from admin"))
	}

	// Get target user
	var target models.User
	if err := s.db.WithContext(ctx).First(&target, targetID).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Demote user
	target.IsAdmin = false
	if err := s.db.WithContext(ctx).Save(&target).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	target.Password = ""
	return c.JSON(fiber.Map{"message": "User demoted from admin", "user": target})
}
