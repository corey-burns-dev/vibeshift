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

func TestGetUserProfile(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	app := setupTestApp()
	app.Get("/users/:id", GetUserProfile)

	// Create test user with posts
	user := models.User{
		Username: "testuser",
		Email:    "test@example.com",
		Password: "hashed",
		Bio:      "Test bio",
		Avatar:   "https://example.com/avatar.jpg",
	}
	database.DB.Create(&user)

	post := models.Post{
		Title:   "User's Post",
		Content: "Post content",
		UserID:  user.ID,
	}
	database.DB.Create(&post)

	tests := []struct {
		name           string
		userID         string
		expectedStatus int
		expectedError  bool
	}{
		{
			name:           "Get existing user profile",
			userID:         fmt.Sprintf("%d", user.ID),
			expectedStatus: fiber.StatusOK,
			expectedError:  false,
		},
		{
			name:           "Get non-existent user profile",
			userID:         "99999",
			expectedStatus: fiber.StatusNotFound,
			expectedError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/users/"+tt.userID, nil)
			resp, err := app.Test(req, -1)

			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			var response map[string]interface{}
			_ = json.NewDecoder(resp.Body).Decode(&response)

			if tt.expectedError {
				assert.NotNil(t, response["error"])
			} else {
				assert.Equal(t, "testuser", response["username"])
				assert.Equal(t, "test@example.com", response["email"])
				assert.Nil(t, response["password"]) // Password should be hidden
				assert.NotNil(t, response["posts"])
			}
		})
	}
}

func TestGetMyProfile(t *testing.T) {
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
	app.Get("/me", func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return GetMyProfile(c)
	})

	// Create user
	user := models.User{
		ID:       1,
		Username: "currentuser",
		Email:    "current@example.com",
		Password: "hashed",
		Bio:      "My bio",
	}
	database.DB.Create(&user)

	req := httptest.NewRequest("GET", "/me", nil)
	resp, err := app.Test(req, -1)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&response)

	assert.Equal(t, "currentuser", response["username"])
	assert.Equal(t, "current@example.com", response["email"])
	assert.Equal(t, "My bio", response["bio"])
	assert.Nil(t, response["password"]) // Password should be hidden
}

func TestUpdateMyProfile(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	testConfig := &config.Config{JWTSecret: "test-secret-key"}
	InitAuthHandlers(testConfig)

	app := setupTestApp()
	app.Put("/me", func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return UpdateMyProfile(c)
	})

	// Create user
	user := models.User{
		ID:       1,
		Username: "oldusername",
		Email:    "old@example.com",
		Password: "hashed",
		Bio:      "Old bio",
		Avatar:   "old-avatar.jpg",
	}
	database.DB.Create(&user)

	tests := []struct {
		name           string
		requestBody    map[string]string
		expectedStatus int
		checkField     string
		expectedValue  string
	}{
		{
			name: "Update username",
			requestBody: map[string]string{
				"username": "newusername",
			},
			expectedStatus: fiber.StatusOK,
			checkField:     "username",
			expectedValue:  "newusername",
		},
		{
			name: "Update bio",
			requestBody: map[string]string{
				"bio": "Updated bio",
			},
			expectedStatus: fiber.StatusOK,
			checkField:     "bio",
			expectedValue:  "Updated bio",
		},
		{
			name: "Update avatar",
			requestBody: map[string]string{
				"avatar": "new-avatar.jpg",
			},
			expectedStatus: fiber.StatusOK,
			checkField:     "avatar",
			expectedValue:  "new-avatar.jpg",
		},
		{
			name: "Update multiple fields",
			requestBody: map[string]string{
				"username": "finalusername",
				"bio":      "Final bio",
				"avatar":   "final-avatar.jpg",
			},
			expectedStatus: fiber.StatusOK,
			checkField:     "username",
			expectedValue:  "finalusername",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Reset user for each test
			database.DB.Model(&user).Updates(models.User{
				Username: "oldusername",
				Bio:      "Old bio",
				Avatar:   "old-avatar.jpg",
			})

			body, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest("PUT", "/me", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			var response map[string]interface{}
			_ = json.NewDecoder(resp.Body).Decode(&response)

			assert.Equal(t, tt.expectedValue, response[tt.checkField])
			assert.Nil(t, response["password"]) // Password should be hidden
		})
	}
}

func TestUpdateMyProfile_InvalidJSON(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	app := setupTestApp()
	app.Put("/me", func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return UpdateMyProfile(c)
	})

	// Create user
	user := models.User{
		ID:       1,
		Username: "testuser",
		Email:    "test@example.com",
		Password: "hashed",
	}
	database.DB.Create(&user)

	req := httptest.NewRequest("PUT", "/me", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}
