package server

import (
	"vibeshift/models"

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

	limit := c.QueryInt("limit", 10)
	offset := c.QueryInt("offset", 0)
	userID, _ := s.optionalUserID(c)

	posts, err := s.postRepo.Search(ctx, q, limit, offset, userID)
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

	return c.Status(fiber.StatusCreated).JSON(post)
}

// GetPosts handles GET /api/posts
func (s *Server) GetPosts(c *fiber.Ctx) error {
	ctx := c.Context()
	limit := c.QueryInt("limit", 20)
	offset := c.QueryInt("offset", 0)
	userID, _ := s.optionalUserID(c)

	posts, err := s.postRepo.List(ctx, limit, offset, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// GetPost handles GET /api/posts/:id
func (s *Server) GetPost(c *fiber.Ctx) error {
	ctx := c.Context()
	id, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}
	userID, _ := s.optionalUserID(c)

	post, err := s.postRepo.GetByID(ctx, uint(id), userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	return c.JSON(post)
}

// GetUserPosts handles GET /api/users/:id/posts
func (s *Server) GetUserPosts(c *fiber.Ctx) error {
	ctx := c.Context()
	userIDParam, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	limit := c.QueryInt("limit", 20)
	offset := c.QueryInt("offset", 0)
	currentUserID, _ := s.optionalUserID(c)

	posts, err := s.postRepo.GetByUserID(ctx, uint(userIDParam), limit, offset, currentUserID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// UpdatePost handles PUT /api/posts/:id
func (s *Server) UpdatePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	var req struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		ImageURL string `json:"image_url,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Get existing post
	post, err := s.postRepo.GetByID(ctx, uint(postID), userID)
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
	postID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	// Get existing post to check ownership
	post, err := s.postRepo.GetByID(ctx, uint(postID), userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check ownership
	if post.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You can only delete your own posts"))
	}

	if err := s.postRepo.Delete(ctx, uint(postID)); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// LikePost handles POST /api/posts/:id/like
// This endpoint toggles the like status - if already liked, it unlikes; if not liked, it likes
func (s *Server) LikePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	// Check if already liked
	var existingLike models.Like
	err = s.db.WithContext(ctx).Where("user_id = ? AND post_id = ?", userID, uint(postID)).First(&existingLike).Error

	switch err {
	case nil:
		// Already liked, so unlike it
		if uerr := s.postRepo.Unlike(ctx, userID, uint(postID)); uerr != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, uerr)
		}
	case gorm.ErrRecordNotFound:
		// Not liked, so like it
		if lerr := s.postRepo.Like(ctx, userID, uint(postID)); lerr != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, lerr)
		}
	default:
		// Some other error
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Return updated post
	post, err := s.postRepo.GetByID(ctx, uint(postID), userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	return c.JSON(post)
}

// UnlikePost handles DELETE /api/posts/:id/like
func (s *Server) UnlikePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	if err := s.postRepo.Unlike(ctx, userID, uint(postID)); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Return updated post
	post, err := s.postRepo.GetByID(ctx, uint(postID), userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	return c.JSON(post)
}
