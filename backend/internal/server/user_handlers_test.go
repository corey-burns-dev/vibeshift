package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestGetUserProfile(t *testing.T) {
	app := fiber.New()
	mockRepo := new(MockUserRepository)
	s := &Server{userRepo: mockRepo}

	app.Get("/users/:id", s.GetUserProfile)

	tests := []struct {
		name           string
		userIDParam    string
		mockSetup      func()
		expectedStatus int
	}{
		{
			name:        "Success",
			userIDParam: "1",
			mockSetup: func() {
				mockRepo.On("GetByID", mock.Anything, uint(1)).Return(&models.User{ID: 1, Username: "testuser"}, nil)
			},
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Invalid ID",
			userIDParam:    "abc",
			mockSetup:      func() {},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:        "Not Found",
			userIDParam: "99",
			mockSetup: func() {
				mockRepo.On("GetByID", mock.Anything, uint(99)).Return(nil, models.NewNotFoundError("User", 99))
			},
			expectedStatus: http.StatusNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockSetup()
			req := httptest.NewRequest(http.MethodGet, "/users/"+tt.userIDParam, nil)
			resp, _ := app.Test(req)
			defer func() { _ = resp.Body.Close() }()
			defer func() { _ = resp.Body.Close() }()
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
		})
	}
}

func TestGetMyProfile(t *testing.T) {
	app := fiber.New()
	mockRepo := new(MockUserRepository)
	s := &Server{userRepo: mockRepo}

	// Middleware to set userID in Locals
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return c.Next()
	})
	app.Get("/users/me", s.GetMyProfile)

	mockRepo.On("GetByID", mock.Anything, uint(1)).Return(&models.User{ID: 1, Username: "me"}, nil)

	req := httptest.NewRequest(http.MethodGet, "/users/me", nil)
	resp, _ := app.Test(req)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
