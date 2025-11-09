package handlers

import (
	"strconv"
	"vibeshift/database"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
)

type CreatePostRequest struct {
	Title    string `json:"title"`
	Content  string `json:"content"`
	ImageURL string `json:"image_url"`
}

type UpdatePostRequest struct {
	Title    string `json:"title"`
	Content  string `json:"content"`
	ImageURL string `json:"image_url"`
}

func CreatePost(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	req := new(CreatePostRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.Title == "" || req.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Title and content are required",
		})
	}

	post := models.Post{
		Title:    req.Title,
		Content:  req.Content,
		ImageURL: req.ImageURL,
		UserID:   userID,
	}

	if err := database.DB.Create(&post).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create post",
		})
	}

	// Load user data
	database.DB.Preload("User").First(&post, post.ID)

	return c.Status(fiber.StatusCreated).JSON(post)
}

func GetAllPosts(c *fiber.Ctx) error {
	var posts []models.Post

	// Get pagination parameters from query
	offset := c.QueryInt("offset", 0)
	limit := c.QueryInt("limit", 10)

	// Validate limit (max 100)
	if limit > 100 {
		limit = 100
	}
	if limit <= 0 {
		limit = 10
	}
	if offset < 0 {
		offset = 0
	}

	if err := database.DB.Preload("User").Order("created_at desc").Offset(offset).Limit(limit).Find(&posts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch posts",
		})
	}

	return c.JSON(posts)
}

func GetPost(c *fiber.Ctx) error {
	id := c.Params("id")
	var post models.Post

	if err := database.DB.Preload("User").First(&post, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Post not found",
		})
	}

	return c.JSON(post)
}

func UpdatePost(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	id := c.Params("id")

	var post models.Post
	if err := database.DB.First(&post, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Post not found",
		})
	}

	// Check if user owns the post
	if post.UserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You can only update your own posts",
		})
	}

	req := new(UpdatePostRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Update fields
	if req.Title != "" {
		post.Title = req.Title
	}
	if req.Content != "" {
		post.Content = req.Content
	}
	if req.ImageURL != "" {
		post.ImageURL = req.ImageURL
	}

	if err := database.DB.Save(&post).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update post",
		})
	}

	database.DB.Preload("User").First(&post, post.ID)

	return c.JSON(post)
}

func DeletePost(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	id := c.Params("id")

	var post models.Post
	if err := database.DB.First(&post, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Post not found",
		})
	}

	// Check if user owns the post
	if post.UserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You can only delete your own posts",
		})
	}

	if err := database.DB.Delete(&post).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete post",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Post deleted successfully",
	})
}

func LikePost(c *fiber.Ctx) error {
	id := c.Params("id")
	idInt, _ := strconv.Atoi(id)

	var post models.Post
	if err := database.DB.First(&post, idInt).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Post not found",
		})
	}

	post.Likes++
	database.DB.Save(&post)

	return c.JSON(fiber.Map{
		"likes": post.Likes,
	})
}

func SearchPosts(c *fiber.Ctx) error {
	query := c.Query("q")
	if query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Search query is required",
		})
	}

	var posts []models.Post

	// Get pagination parameters from query
	offset := c.QueryInt("offset", 0)
	limit := c.QueryInt("limit", 10)

	// Validate limit (max 100)
	if limit > 100 {
		limit = 100
	}
	if limit <= 0 {
		limit = 10
	}
	if offset < 0 {
		offset = 0
	}

	// Search in title and content using LIKE
	if err := database.DB.Preload("User").
		Where("title LIKE ? OR content LIKE ?", "%"+query+"%", "%"+query+"%").
		Order("created_at desc").
		Offset(offset).
		Limit(limit).
		Find(&posts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to search posts",
		})
	}

	return c.JSON(posts)
}
