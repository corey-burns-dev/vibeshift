// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"errors"
	"time"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// SearchPosts handles GET /api/posts/search?q=...
func (s *Server) SearchPosts(c *fiber.Ctx) error {
	ctx := c.Context()
	q := c.Query("q")
	if q == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Search query is required"))
	}

	page := parsePagination(c, 10)
	userID, _ := s.optionalUserID(c)

	posts, err := s.postRepo.Search(ctx, q, page.Limit, page.Offset, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// CreatePost handles POST /api/posts
func (s *Server) CreatePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var req struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		ImageURL string `json:"image_url,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Validate required fields
	if req.Title == "" || req.Content == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Title and content are required"))
	}

	post := &models.Post{
		Title:    req.Title,
		Content:  req.Content,
		ImageURL: req.ImageURL,
		UserID:   userID,
	}

	if err := s.postRepo.Create(ctx, post); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Load user data for response
	post, err := s.postRepo.GetByID(ctx, post.ID, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
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
	ctx := c.Context()
	page := parsePagination(c, 20)
	userID, _ := s.optionalUserID(c)

	posts, err := s.postRepo.List(ctx, page.Limit, page.Offset, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// GetPost handles GET /api/posts/:id
func (s *Server) GetPost(c *fiber.Ctx) error {
	ctx := c.Context()
	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	userID, _ := s.optionalUserID(c)

	post, err := s.postRepo.GetByID(ctx, id, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	return c.JSON(post)
}

// GetUserPosts handles GET /api/users/:id/posts
func (s *Server) GetUserPosts(c *fiber.Ctx) error {
	ctx := c.Context()
	userIDParam, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	page := parsePagination(c, 20)
	currentUserID, _ := s.optionalUserID(c)

	posts, err := s.postRepo.GetByUserID(ctx, userIDParam, page.Limit, page.Offset, currentUserID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// UpdatePost handles PUT /api/posts/:id
func (s *Server) UpdatePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var req struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		ImageURL string `json:"image_url,omitempty"`
	}
	parseErr := c.BodyParser(&req)
	if parseErr != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Get existing post
	var post *models.Post
	post, err = s.postRepo.GetByID(ctx, postID, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check ownership
	if post.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You can only update your own posts"))
	}

	// Update fields if provided
	if req.Title != "" {
		post.Title = req.Title
	}
	if req.Content != "" {
		post.Content = req.Content
	}
	if req.ImageURL != "" {
		post.ImageURL = req.ImageURL
	}

	if err := s.postRepo.Update(ctx, post); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(post)
}

// DeletePost handles DELETE /api/posts/:id
func (s *Server) DeletePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	// Get existing post to check ownership
	post, err := s.postRepo.GetByID(ctx, postID, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check ownership or admin status
	if post.UserID != userID {
		admin, adminErr := s.isAdmin(c, userID)
		if adminErr != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, adminErr)
		}
		if !admin {
			return models.RespondWithError(c, fiber.StatusForbidden,
				models.NewUnauthorizedError("You can only delete your own posts"))
		}
	}

	if err := s.postRepo.Delete(ctx, postID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// LikePost handles POST /api/posts/:id/like
// This endpoint toggles the like status - if already liked, it unlikes; if not liked, it likes
func (s *Server) LikePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	// Check if already liked
	var existingLike models.Like
	err = s.db.WithContext(ctx).Where("user_id = ? AND post_id = ?", userID, postID).First(&existingLike).Error

	switch {
	case err == nil:
		// Already liked, so unlike it
		if uerr := s.postRepo.Unlike(ctx, userID, postID); uerr != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, uerr)
		}
	case errors.Is(err, gorm.ErrRecordNotFound):
		// Not liked, so like it
		if lerr := s.postRepo.Like(ctx, userID, postID); lerr != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, lerr)
		}
	default:
		// Some other error
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Return updated post
	post, err := s.postRepo.GetByID(ctx, postID, userID)
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
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	if unlikeErr := s.postRepo.Unlike(ctx, userID, postID); unlikeErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, unlikeErr)
	}

	// Return updated post
	post, err := s.postRepo.GetByID(ctx, postID, userID)
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
