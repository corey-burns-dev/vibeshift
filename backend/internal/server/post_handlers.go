// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"errors"
	"strconv"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/service"

	"github.com/gofiber/fiber/v2"
)

// SearchPosts handles GET /api/posts/search?q=...
func (s *Server) SearchPosts(c *fiber.Ctx) error {
	ctx := c.UserContext()
	q := c.Query("q")
	page := parsePagination(c, 10)
	userID := s.optionalUserID(c)

	posts, err := s.postSvc().SearchPosts(ctx, q, page.Limit, page.Offset, userID)
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "VALIDATION_ERROR" {
			status = fiber.StatusBadRequest
		}
		return models.RespondWithError(c, status, err)
	}

	return c.JSON(posts)
}

// CreatePost handles POST /api/posts
func (s *Server) CreatePost(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	var req struct {
		Title      string                       `json:"title"`
		Content    string                       `json:"content"`
		ImageURL   string                       `json:"image_url,omitempty"`
		PostType   string                       `json:"post_type,omitempty"`
		LinkURL    string                       `json:"link_url,omitempty"`
		YoutubeURL string                       `json:"youtube_url,omitempty"`
		SanctumID  *uint                        `json:"sanctum_id,omitempty"`
		Poll       *service.CreatePostPollInput `json:"poll,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	post, err := s.postSvc().CreatePost(ctx, service.CreatePostInput{
		UserID:     userID,
		Title:      req.Title,
		Content:    req.Content,
		ImageURL:   req.ImageURL,
		PostType:   req.PostType,
		LinkURL:    req.LinkURL,
		YoutubeURL: req.YoutubeURL,
		SanctumID:  req.SanctumID,
		Poll:       req.Poll,
	})
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "VALIDATION_ERROR" {
			status = fiber.StatusBadRequest
		}
		return models.RespondWithError(c, status, err)
	}

	s.publishBroadcastEvent(EventPostCreated, map[string]interface{}{
		"post_id":    post.ID,
		"author_id":  post.UserID,
		"created_at": time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.Status(fiber.StatusCreated).JSON(post)
}

// GetPosts handles GET /api/posts
func (s *Server) GetPosts(c *fiber.Ctx) error {
	ctx := c.UserContext()
	page := parsePagination(c, 20)
	userID := s.optionalUserID(c)

	var sanctumID *uint
	sanctumIDStr := c.Query("sanctum_id")
	if sanctumIDStr != "" {
		parsed, err := strconv.ParseUint(sanctumIDStr, 10, 32)
		if err == nil {
			id := uint(parsed)
			sanctumID = &id
		}
	}

	posts, err := s.postSvc().ListPosts(ctx, service.ListPostsInput{
		Limit:         page.Limit,
		Offset:        page.Offset,
		CurrentUserID: userID,
		SanctumID:     sanctumID,
	})
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// GetPost handles GET /api/posts/:id
func (s *Server) GetPost(c *fiber.Ctx) error {
	ctx := c.UserContext()
	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	userID := s.optionalUserID(c)

	post, err := s.postSvc().GetPost(ctx, id, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	return c.JSON(post)
}

// GetUserPosts handles GET /api/users/:id/posts
func (s *Server) GetUserPosts(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userIDParam, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	page := parsePagination(c, 20)
	currentUserID := s.optionalUserID(c)

	posts, err := s.postSvc().GetUserPosts(ctx, userIDParam, page.Limit, page.Offset, currentUserID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// UpdatePost handles PUT /api/posts/:id
func (s *Server) UpdatePost(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var req struct {
		Title      string `json:"title"`
		Content    string `json:"content"`
		ImageURL   string `json:"image_url,omitempty"`
		LinkURL    string `json:"link_url,omitempty"`
		YoutubeURL string `json:"youtube_url,omitempty"`
	}
	parseErr := c.BodyParser(&req)
	if parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	post, err := s.postSvc().UpdatePost(ctx, service.UpdatePostInput{
		UserID:     userID,
		PostID:     postID,
		Title:      req.Title,
		Content:    req.Content,
		ImageURL:   req.ImageURL,
		LinkURL:    req.LinkURL,
		YoutubeURL: req.YoutubeURL,
	})
	if err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "UNAUTHORIZED":
				status = fiber.StatusForbidden
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			}
		}
		return models.RespondWithError(c, status, err)
	}

	return c.JSON(post)
}

// DeletePost handles DELETE /api/posts/:id
func (s *Server) DeletePost(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	if err := s.postSvc().DeletePost(ctx, service.DeletePostInput{
		UserID: userID,
		PostID: postID,
	}); err != nil {
		status := fiber.StatusInternalServerError
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			switch appErr.Code {
			case "UNAUTHORIZED":
				status = fiber.StatusForbidden
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			}
		}
		return models.RespondWithError(c, status, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// LikePost handles POST /api/posts/:id/like
// This endpoint toggles the like status - if already liked, it unlikes; if not liked, it likes
func (s *Server) LikePost(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	post, err := s.postSvc().ToggleLike(ctx, userID, postID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	s.publishBroadcastEvent(EventPostReactionUpdated, map[string]interface{}{
		"post_id":        post.ID,
		"likes_count":    post.LikesCount,
		"comments_count": post.CommentsCount,
		"updated_at":     time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.JSON(post)
}

// UnlikePost handles DELETE /api/posts/:id/like
func (s *Server) UnlikePost(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	post, err := s.postSvc().UnlikePost(ctx, userID, postID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	s.publishBroadcastEvent(EventPostReactionUpdated, map[string]interface{}{
		"post_id":        post.ID,
		"likes_count":    post.LikesCount,
		"comments_count": post.CommentsCount,
		"updated_at":     time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.JSON(post)
}

// VotePoll handles POST /api/posts/:id/poll/vote
func (s *Server) VotePoll(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var req struct {
		PollOptionID uint `json:"poll_option_id"`
	}
	if bodyErr := c.BodyParser(&req); bodyErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}
	if req.PollOptionID == 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("poll_option_id is required"))
	}

	post, err := s.postSvc().VotePoll(ctx, userID, postID, req.PollOptionID)
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

	return c.JSON(post)
}

func (s *Server) postSvc() *service.PostService {
	return s.postService
}
