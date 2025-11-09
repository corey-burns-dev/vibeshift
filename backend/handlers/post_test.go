package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
	"vibeshift/config"
	"vibeshift/database"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Helper function to create authenticated request
func createAuthenticatedUser(app *fiber.App) (string, uint) {
	signupBody, _ := json.Marshal(map[string]string{
		"username": "postuser",
		"email":    "post@example.com",
		"password": "password123",
	})
	req := httptest.NewRequest("POST", "/signup", bytes.NewReader(signupBody))
	req.Header.Set("Content-Type", "application/json")

	resp, _ := app.Test(req, -1)
	var signupResp AuthResponse
	_ = json.NewDecoder(resp.Body).Decode(&signupResp)

	return signupResp.Token, signupResp.User.ID
}

func TestCreatePost(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	testConfig := &config.Config{JWTSecret: "test-secret-key"}
	InitAuthHandlers(testConfig)

	app := setupTestApp()
	app.Post("/signup", Signup)
	app.Post("/posts", func(c *fiber.Ctx) error {
		// Mock auth middleware
		c.Locals("userID", uint(1))
		return CreatePost(c)
	})

	// Create authenticated user
	token, userID := createAuthenticatedUser(app)

	tests := []struct {
		name           string
		requestBody    map[string]string
		useAuth        bool
		expectedStatus int
		expectedError  bool
	}{
		{
			name: "Valid post creation",
			requestBody: map[string]string{
				"title":     "Test Post",
				"content":   "This is a test post",
				"image_url": "https://example.com/image.jpg",
			},
			useAuth:        true,
			expectedStatus: fiber.StatusCreated,
			expectedError:  false,
		},
		{
			name: "Missing title",
			requestBody: map[string]string{
				"content": "Content without title",
			},
			useAuth:        true,
			expectedStatus: fiber.StatusBadRequest,
			expectedError:  true,
		},
		{
			name: "Missing content",
			requestBody: map[string]string{
				"title": "Title without content",
			},
			useAuth:        true,
			expectedStatus: fiber.StatusBadRequest,
			expectedError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Ensure user exists in DB for the mock middleware
			database.DB.Create(&models.User{
				ID:       userID,
				Username: "postuser",
				Email:    "post@example.com",
				Password: "hashed",
			})

			body, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest("POST", "/posts", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			if tt.useAuth {
				req.Header.Set("Authorization", "Bearer "+token)
			}

			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			var response map[string]any
			_ = json.NewDecoder(resp.Body).Decode(&response)

			if tt.expectedError {
				assert.NotNil(t, response["error"])
			} else {
				assert.NotNil(t, response["id"])
				assert.Equal(t, tt.requestBody["title"], response["title"])
			}
		})
	}
}

func TestGetAllPosts(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	app := setupTestApp()
	app.Get("/posts", GetAllPosts)

	// Create test posts
	user := models.User{Username: "testuser", Email: "test@example.com", Password: "hashed"}
	database.DB.Create(&user)

	for i := 1; i <= 5; i++ {
		database.DB.Create(&models.Post{
			Title:   fmt.Sprintf("Post %d", i),
			Content: fmt.Sprintf("Content %d", i),
			UserID:  user.ID,
		})
	}

	tests := []struct {
		name           string
		queryParams    string
		expectedStatus int
		minPosts       int
	}{
		{
			name:           "Get all posts without pagination",
			queryParams:    "",
			expectedStatus: fiber.StatusOK,
			minPosts:       5,
		},
		{
			name:           "Get posts with limit",
			queryParams:    "?limit=2",
			expectedStatus: fiber.StatusOK,
			minPosts:       2,
		},
		{
			name:           "Get posts with offset",
			queryParams:    "?offset=2&limit=2",
			expectedStatus: fiber.StatusOK,
			minPosts:       2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/posts"+tt.queryParams, nil)
			resp, err := app.Test(req, -1)

			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			var posts []models.Post
			_ = json.NewDecoder(resp.Body).Decode(&posts)
			assert.GreaterOrEqual(t, len(posts), tt.minPosts)
		})
	}
}

func TestGetPost(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	app := setupTestApp()
	app.Get("/posts/:id", GetPost)

	// Create test post
	user := models.User{Username: "testuser", Email: "test@example.com", Password: "hashed"}
	database.DB.Create(&user)

	post := models.Post{
		Title:   "Test Post",
		Content: "Test Content",
		UserID:  user.ID,
	}
	database.DB.Create(&post)

	tests := []struct {
		name           string
		postID         string
		expectedStatus int
		expectedError  bool
	}{
		{
			name:           "Get existing post",
			postID:         fmt.Sprintf("%d", post.ID),
			expectedStatus: fiber.StatusOK,
			expectedError:  false,
		},
		{
			name:           "Get non-existent post",
			postID:         "99999",
			expectedStatus: fiber.StatusNotFound,
			expectedError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/posts/"+tt.postID, nil)
			resp, err := app.Test(req, -1)

			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			var response map[string]interface{}
			_ = json.NewDecoder(resp.Body).Decode(&response)

			if tt.expectedError {
				assert.NotNil(t, response["error"])
			} else {
				assert.Equal(t, "Test Post", response["title"])
			}
		})
	}
}

func TestUpdatePost(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	testConfig := &config.Config{JWTSecret: "test-secret-key"}
	InitAuthHandlers(testConfig)

	app := setupTestApp()
	app.Post("/signup", Signup)
	app.Put("/posts/:id", func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return UpdatePost(c)
	})

	// Create user and post
	user := models.User{Username: "testuser", Email: "test@example.com", Password: "hashed"}
	database.DB.Create(&user)

	post := models.Post{
		Title:   "Original Title",
		Content: "Original Content",
		UserID:  user.ID,
	}
	database.DB.Create(&post)

	tests := []struct {
		name           string
		postID         string
		requestBody    map[string]string
		expectedStatus int
		expectedError  bool
	}{
		{
			name:   "Valid post update",
			postID: fmt.Sprintf("%d", post.ID),
			requestBody: map[string]string{
				"title":   "Updated Title",
				"content": "Updated Content",
			},
			expectedStatus: fiber.StatusOK,
			expectedError:  false,
		},
		{
			name:   "Update non-existent post",
			postID: "99999",
			requestBody: map[string]string{
				"title": "Updated Title",
			},
			expectedStatus: fiber.StatusNotFound,
			expectedError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest("PUT", "/posts/"+tt.postID, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
		})
	}
}

func TestDeletePost(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	app := setupTestApp()
	app.Delete("/posts/:id", func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return DeletePost(c)
	})

	// Create user and post
	user := models.User{Username: "testuser", Email: "test@example.com", Password: "hashed"}
	database.DB.Create(&user)

	post := models.Post{
		Title:   "Post to Delete",
		Content: "This will be deleted",
		UserID:  user.ID,
	}
	database.DB.Create(&post)

	tests := []struct {
		name           string
		postID         string
		expectedStatus int
		expectedError  bool
	}{
		{
			name:           "Delete existing post",
			postID:         fmt.Sprintf("%d", post.ID),
			expectedStatus: fiber.StatusOK,
			expectedError:  false,
		},
		{
			name:           "Delete non-existent post",
			postID:         "99999",
			expectedStatus: fiber.StatusNotFound,
			expectedError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("DELETE", "/posts/"+tt.postID, nil)
			resp, err := app.Test(req, -1)

			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
		})
	}
}

func TestLikePost(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	app := setupTestApp()
	app.Post("/posts/:id/like", LikePost)

	// Create user and post
	user := models.User{Username: "testuser", Email: "test@example.com", Password: "hashed"}
	database.DB.Create(&user)

	post := models.Post{
		Title:   "Post to Like",
		Content: "Content",
		UserID:  user.ID,
		Likes:   0,
	}
	database.DB.Create(&post)

	req := httptest.NewRequest("POST", fmt.Sprintf("/posts/%d/like", post.ID), nil)
	resp, err := app.Test(req, -1)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&response)
	assert.Equal(t, float64(1), response["likes"])
}

func TestSearchPosts(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	app := setupTestApp()
	app.Get("/posts/search", SearchPosts)

	// Create test posts
	user := models.User{Username: "testuser", Email: "test@example.com", Password: "hashed"}
	database.DB.Create(&user)

	database.DB.Create(&models.Post{
		Title:   "Go Programming",
		Content: "Learn Go language",
		UserID:  user.ID,
	})
	database.DB.Create(&models.Post{
		Title:   "React Tutorial",
		Content: "Learn React framework",
		UserID:  user.ID,
	})

	tests := []struct {
		name           string
		query          string
		expectedStatus int
		expectedError  bool
	}{
		{
			name:           "Search with valid query",
			query:          "?q=Go",
			expectedStatus: fiber.StatusOK,
			expectedError:  false,
		},
		{
			name:           "Search without query parameter",
			query:          "",
			expectedStatus: fiber.StatusBadRequest,
			expectedError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/posts/search"+tt.query, nil)
			resp, err := app.Test(req, -1)

			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
		})
	}
}
