package server

import (
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
)

// GetAllUsers handles GET /api/users
func (s *Server) GetAllUsers(c *fiber.Ctx) error {
	ctx := c.Context()
	limit := c.QueryInt("limit", 100)
	offset := c.QueryInt("offset", 0)

	users, err := s.userRepo.List(ctx, limit, offset)
	if err != nil {
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
	if err != nil {
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
