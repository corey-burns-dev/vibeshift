package handlers

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"vibeshift/config"
	"vibeshift/database"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupTestDB creates an in-memory SQLite database for testing
func setupTestDB() *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to connect to test database")
	}

	// Auto migrate the schema
	db.AutoMigrate(&models.User{}, &models.Post{}, &models.Comment{})

	return db
}

// setupTestApp creates a fresh Fiber app for testing
func setupTestApp() *fiber.App {
	app := fiber.New()
	return app
}

func TestSignup(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	// Initialize auth handlers with test config
	testConfig := &config.Config{
		JWTSecret: "test-secret-key",
	}
	InitAuthHandlers(testConfig)

	app := setupTestApp()
	app.Post("/signup", Signup)

	tests := []struct {
		name           string
		requestBody    map[string]string
		expectedStatus int
		expectedError  bool
	}{
		{
			name: "Valid signup",
			requestBody: map[string]string{
				"username": "testuser",
				"email":    "test@example.com",
				"password": "password123",
			},
			expectedStatus: fiber.StatusCreated,
			expectedError:  false,
		},
		{
			name: "Missing username",
			requestBody: map[string]string{
				"email":    "test2@example.com",
				"password": "password123",
			},
			expectedStatus: fiber.StatusBadRequest,
			expectedError:  true,
		},
		{
			name: "Missing email",
			requestBody: map[string]string{
				"username": "testuser2",
				"password": "password123",
			},
			expectedStatus: fiber.StatusBadRequest,
			expectedError:  true,
		},
		{
			name: "Missing password",
			requestBody: map[string]string{
				"username": "testuser3",
				"email":    "test3@example.com",
			},
			expectedStatus: fiber.StatusBadRequest,
			expectedError:  true,
		},
		{
			name: "Duplicate username",
			requestBody: map[string]string{
				"username": "testuser",
				"email":    "test4@example.com",
				"password": "password123",
			},
			expectedStatus: fiber.StatusConflict,
			expectedError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest("POST", "/signup", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			var response map[string]interface{}
			json.NewDecoder(resp.Body).Decode(&response)

			if tt.expectedError {
				assert.NotNil(t, response["error"])
			} else {
				assert.NotNil(t, response["token"])
				assert.NotNil(t, response["user"])
			}
		})
	}
}

func TestLogin(t *testing.T) {
	// Setup
	database.DB = setupTestDB()
	defer func() {
		sqlDB, _ := database.DB.DB()
		sqlDB.Close()
	}()

	// Initialize auth handlers with test config
	testConfig := &config.Config{
		JWTSecret: "test-secret-key",
	}
	InitAuthHandlers(testConfig)

	app := setupTestApp()
	app.Post("/signup", Signup)
	app.Post("/login", Login)

	// Create a test user first
	signupBody, _ := json.Marshal(map[string]string{
		"username": "logintest",
		"email":    "login@example.com",
		"password": "password123",
	})
	signupReq := httptest.NewRequest("POST", "/signup", bytes.NewReader(signupBody))
	signupReq.Header.Set("Content-Type", "application/json")
	app.Test(signupReq, -1)

	tests := []struct {
		name           string
		requestBody    map[string]string
		expectedStatus int
		expectedError  bool
	}{
		{
			name: "Valid login",
			requestBody: map[string]string{
				"email":    "login@example.com",
				"password": "password123",
			},
			expectedStatus: fiber.StatusOK,
			expectedError:  false,
		},
		{
			name: "Wrong password",
			requestBody: map[string]string{
				"email":    "login@example.com",
				"password": "wrongpassword",
			},
			expectedStatus: fiber.StatusUnauthorized,
			expectedError:  true,
		},
		{
			name: "Non-existent user",
			requestBody: map[string]string{
				"email":    "nonexistent@example.com",
				"password": "password123",
			},
			expectedStatus: fiber.StatusUnauthorized,
			expectedError:  true,
		},
		{
			name: "Missing email",
			requestBody: map[string]string{
				"password": "password123",
			},
			expectedStatus: fiber.StatusUnauthorized,
			expectedError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest("POST", "/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			var response map[string]interface{}
			json.NewDecoder(resp.Body).Decode(&response)

			if tt.expectedError {
				assert.NotNil(t, response["error"])
			} else {
				assert.NotNil(t, response["token"])
				assert.NotNil(t, response["user"])
			}
		})
	}
}
