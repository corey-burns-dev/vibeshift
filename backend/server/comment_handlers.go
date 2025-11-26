package server

import (
	"fmt"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
)

// CreateComment creates a comment on a post (protected)
func (s *Server) CreateComment(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	postIDParam := c.Params("id")

	// Validate post ID
	var postID uint
	if _, err := fmt.Sscan(postIDParam, &postID); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid post ID"))
	}

	// Verify post exists
	if _, err := s.postRepo.GetByID(ctx, postID, 0); err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid request body"))
	}
	if req.Content == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Content is required"))
	}

	comment := &models.Comment{
		Content: req.Content,
		UserID:  userID,
		PostID:  postID,
	}

	if err := s.commentRepo.Create(ctx, comment); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Load created comment with user
	created, err := s.commentRepo.GetByID(ctx, comment.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.Status(fiber.StatusCreated).JSON(created)
}

// GetComments returns all comments for a post (public)
func (s *Server) GetComments(c *fiber.Ctx) error {
	ctx := c.UserContext()
	postIDParam := c.Params("id")
	var postID uint
	if _, err := fmt.Sscan(postIDParam, &postID); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid post ID"))
	}

	// Verify post exists
	if _, err := s.postRepo.GetByID(ctx, postID, 0); err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	comments, err := s.commentRepo.ListByPost(ctx, postID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(comments)
}

// UpdateComment updates a comment (only owner)
func (s *Server) UpdateComment(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	commentIDParam := c.Params("commentId")
	var commentID uint
	if _, err := fmt.Sscan(commentIDParam, &commentID); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid comment ID"))
	}

	comment, err := s.commentRepo.GetByID(ctx, commentID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	if comment.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden, models.NewUnauthorizedError("You can only update your own comments"))
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid request body"))
	}
	if req.Content == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Content is required"))
	}

	comment.Content = req.Content
	if err := s.commentRepo.Update(ctx, comment); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	updated, err := s.commentRepo.GetByID(ctx, comment.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(updated)
}

// DeleteComment deletes a comment (owner only)
func (s *Server) DeleteComment(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	commentIDParam := c.Params("commentId")
	var commentID uint
	if _, err := fmt.Sscan(commentIDParam, &commentID); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid comment ID"))
	}

	comment, err := s.commentRepo.GetByID(ctx, commentID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	if comment.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden, models.NewUnauthorizedError("You can only delete your own comments"))
	}

	if err := s.commentRepo.Delete(ctx, commentID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusOK)
}
