package handlers

import (
	"vibeshift/database"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
)

type CreateCommentRequest struct {
	Content string `json:"content"`
}

type UpdateCommentRequest struct {
	Content string `json:"content"`
}

// CreateComment - Create a comment on a post (protected)
func CreateComment(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	postID := c.Params("id")

	// Verify post exists
	var post models.Post
	if err := database.DB.First(&post, postID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Post not found",
		})
	}

	req := new(CreateCommentRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Content is required",
		})
	}

	comment := models.Comment{
		Content: req.Content,
		UserID:  userID,
		PostID:  post.ID,
	}

	if err := database.DB.Create(&comment).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create comment",
		})
	}

	// Load user data
	database.DB.Preload("User").First(&comment, comment.ID)

	return c.Status(fiber.StatusCreated).JSON(comment)
}

// GetComments - Get all comments for a post (public)
func GetComments(c *fiber.Ctx) error {
	postID := c.Params("id")
	var comments []models.Comment

	// Verify post exists
	var post models.Post
	if err := database.DB.First(&post, postID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Post not found",
		})
	}

	if err := database.DB.Where("post_id = ?", postID).Preload("User").Order("created_at desc").Find(&comments).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch comments",
		})
	}

	return c.JSON(comments)
}

// UpdateComment - Update a comment (protected - only owner can update)
func UpdateComment(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	commentID := c.Params("commentId")

	var comment models.Comment
	if err := database.DB.First(&comment, commentID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Comment not found",
		})
	}

	// Check if user owns the comment
	if comment.UserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You can only update your own comments",
		})
	}

	req := new(UpdateCommentRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Content is required",
		})
	}

	comment.Content = req.Content
	if err := database.DB.Save(&comment).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update comment",
		})
	}

	database.DB.Preload("User").First(&comment, comment.ID)

	return c.JSON(comment)
}

// DeleteComment - Delete a comment (protected - only owner can delete)
func DeleteComment(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	commentID := c.Params("commentId")

	var comment models.Comment
	if err := database.DB.First(&comment, commentID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Comment not found",
		})
	}

	// Check if user owns the comment
	if comment.UserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You can only delete your own comments",
		})
	}

	if err := database.DB.Delete(&comment).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete comment",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Comment deleted successfully",
	})
}
