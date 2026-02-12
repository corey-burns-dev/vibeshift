// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"errors"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/service"

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

	var req struct {
		Content string `json:"content"`
	}
	if parseErr := c.BodyParser(&req); parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid request body"))
	}

	created, err := s.commentSvc().CreateComment(ctx, service.CreateCommentInput{
		UserID:  userID,
		PostID:  postID,
		Content: req.Content,
	})
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

	comments, err := s.commentSvc().ListComments(ctx, postID)
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "NOT_FOUND" {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
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

	var req struct {
		Content string `json:"content"`
	}
	if parseErr := c.BodyParser(&req); parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid request body"))
	}

	updated, err := s.commentSvc().UpdateComment(ctx, service.UpdateCommentInput{
		UserID:    userID,
		CommentID: commentID,
		Content:   req.Content,
	})
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "VALIDATION_ERROR":
				status = fiber.StatusBadRequest
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			case "UNAUTHORIZED":
				status = fiber.StatusForbidden
			}
		}
		return models.RespondWithError(c, status, err)
	}

	commentsCount := 0
	if post, postErr := s.postRepo.GetByID(ctx, updated.PostID, userID); postErr == nil {
		commentsCount = post.CommentsCount
	}
	s.publishBroadcastEvent(EventCommentUpdated, map[string]interface{}{
		"post_id":        updated.PostID,
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

	comment, err := s.commentSvc().DeleteComment(ctx, service.DeleteCommentInput{
		UserID:    userID,
		CommentID: commentID,
	})
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			case "UNAUTHORIZED":
				status = fiber.StatusForbidden
			}
		}
		return models.RespondWithError(c, status, err)
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

func (s *Server) commentSvc() *service.CommentService {
	if s.commentService == nil {
		s.commentService = service.NewCommentService(s.commentRepo, s.postRepo, s.isAdminByUserID)
	}
	return s.commentService
}
