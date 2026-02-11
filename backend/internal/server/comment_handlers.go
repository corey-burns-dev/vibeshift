// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"time"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
)

// CreateComment creates a comment on a post (protected)
func (s *Server) CreateComment(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	// Verify post exists
	if _, postErr := s.postRepo.GetByID(ctx, postID, 0); postErr != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, postErr)
	}

	var req struct {
		Content string `json:"content"`
	}
	if parseErr := c.BodyParser(&req); parseErr != nil {
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

	if createErr := s.commentRepo.Create(ctx, comment); createErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, createErr)
	}

	// Load created comment with user
	created, err := s.commentRepo.GetByID(ctx, comment.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	commentsCount := 0
	if post, postErr := s.postRepo.GetByID(ctx, postID, userID); postErr == nil {
		commentsCount = post.CommentsCount
	}
	s.publishBroadcastEvent(EventCommentCreated, map[string]interface{}{
		"post_id":        postID,
		"comment":        created,
		"comments_count": commentsCount,
		"updated_at":     time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.Status(fiber.StatusCreated).JSON(created)
}

// GetComments returns all comments for a post (public)
func (s *Server) GetComments(c *fiber.Ctx) error {
	ctx := c.UserContext()

	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	// Verify post exists
	if _, postErr := s.postRepo.GetByID(ctx, postID, 0); postErr != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, postErr)
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

	commentID, err := s.parseID(c, "commentId")
	if err != nil {
		return nil
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
	if parseErr := c.BodyParser(&req); parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid request body"))
	}
	if req.Content == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Content is required"))
	}

	comment.Content = req.Content
	if updateErr := s.commentRepo.Update(ctx, comment); updateErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, updateErr)
	}

	updated, err := s.commentRepo.GetByID(ctx, comment.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	commentsCount := 0
	if post, postErr := s.postRepo.GetByID(ctx, comment.PostID, userID); postErr == nil {
		commentsCount = post.CommentsCount
	}
	s.publishBroadcastEvent(EventCommentUpdated, map[string]interface{}{
		"post_id":        comment.PostID,
		"comment":        updated,
		"comments_count": commentsCount,
		"updated_at":     time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.JSON(updated)
}

// DeleteComment deletes a comment (owner only)
func (s *Server) DeleteComment(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	commentID, err := s.parseID(c, "commentId")
	if err != nil {
		return nil
	}

	comment, err := s.commentRepo.GetByID(ctx, commentID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	if comment.UserID != userID {
		// Check if user is admin
		admin, adminErr := s.isAdmin(c, userID)
		if adminErr != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, adminErr)
		}
		if !admin {
			return models.RespondWithError(c, fiber.StatusForbidden, models.NewUnauthorizedError("You can only delete your own comments"))
		}
	}

	if err := s.commentRepo.Delete(ctx, commentID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	commentsCount := 0
	if post, postErr := s.postRepo.GetByID(ctx, comment.PostID, userID); postErr == nil {
		commentsCount = post.CommentsCount
	}
	s.publishBroadcastEvent(EventCommentDeleted, map[string]interface{}{
		"post_id":        comment.PostID,
		"comment_id":     commentID,
		"comments_count": commentsCount,
		"updated_at":     time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.SendStatus(fiber.StatusOK)
}
