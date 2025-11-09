package handlers

import (
	"vibeshift/database"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
)

type UpdateUserRequest struct {
	Username string `json:"username"`
	Bio      string `json:"bio"`
	Avatar   string `json:"avatar"`
}

// GetUserProfile - Get user profile by ID (public)
func GetUserProfile(c *fiber.Ctx) error {
	id := c.Params("id")
	var user models.User

	if err := database.DB.Preload("Posts").First(&user, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	// Hide password
	user.Password = ""

	return c.JSON(user)
}

// GetMyProfile - Get current user's profile (protected)
func GetMyProfile(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	var user models.User

	if err := database.DB.Preload("Posts").First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	// Hide password
	user.Password = ""

	return c.JSON(user)
}

// UpdateMyProfile - Update current user's profile (protected)
func UpdateMyProfile(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	req := new(UpdateUserRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
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

	if err := database.DB.Save(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update profile",
		})
	}

	// Hide password
	user.Password = ""

	return c.JSON(user)
}
