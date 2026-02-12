package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sanctum/internal/config"
	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"golang.org/x/crypto/bcrypt"
)

// MockUserRepository is a mock of the UserRepository interface
type MockUserRepository struct {
	mock.Mock
}

func (m *MockUserRepository) GetByID(ctx context.Context, id uint) (*models.User, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockUserRepository) GetByIDWithPosts(ctx context.Context, id uint, limit int) (*models.User, error) {
	args := m.Called(ctx, id, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockUserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockUserRepository) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	args := m.Called(ctx, username)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockUserRepository) Create(ctx context.Context, user *models.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *MockUserRepository) Update(ctx context.Context, user *models.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *MockUserRepository) Delete(ctx context.Context, id uint) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockUserRepository) List(ctx context.Context, limit, offset int) ([]models.User, error) {
	args := m.Called(ctx, limit, offset)
	return args.Get(0).([]models.User), args.Error(1)
}

func TestSignup(t *testing.T) {
	app := fiber.New()
	mockRepo := new(MockUserRepository)

	s := &Server{
		config:   &config.Config{JWTSecret: "test_secret"},
		userRepo: mockRepo,
	}

	app.Post("/signup", s.Signup)

	tests := []struct {
		name           string
		body           map[string]string
		mockSetup      func()
		expectedStatus int
	}{
		{
			name: "Success",
			body: map[string]string{
				"username": "testuser",
				"email":    "test@example.com",
				"password": "Password123!",
			},
			mockSetup: func() {
				mockRepo.On("GetByEmail", mock.Anything, "test@example.com").Return(nil, nil)
				mockRepo.On("Create", mock.Anything, mock.Anything).Return(nil)
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Duplicate User",
			body: map[string]string{
				"username": "testuser",
				"email":    "exists@example.com",
				"password": "Password123!",
			},
			mockSetup: func() {
				mockRepo.On("GetByEmail", mock.Anything, "exists@example.com").Return(&models.User{ID: 1}, nil)
			},
			expectedStatus: http.StatusConflict,
		},
		{
			name: "Invalid Username",
			body: map[string]string{
				"username": "a",
				"email":    "valid@example.com",
				"password": "Password123!",
			},
			mockSetup:      func() {},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name: "Invalid Email",
			body: map[string]string{
				"username": "validuser",
				"email":    "invalid-email",
				"password": "Password123!",
			},
			mockSetup:      func() {},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name: "Weak Password",
			body: map[string]string{
				"username": "validuser",
				"email":    "valid@example.com",
				"password": "123",
			},
			mockSetup:      func() {},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockSetup()
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/signup", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, _ := app.Test(req)
			defer func() { _ = resp.Body.Close() }()
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			if tt.expectedStatus == http.StatusCreated {
				var result map[string]interface{}
				json.NewDecoder(resp.Body).Decode(&result)
				assert.Contains(t, result, "token")
				assert.Contains(t, result, "refresh_token")
				assert.Contains(t, result, "user")
			}
		})
	}
}

func TestLogin(t *testing.T) {
	app := fiber.New()
	mockRepo := new(MockUserRepository)

	s := &Server{
		config:   &config.Config{JWTSecret: "test_secret"},
		userRepo: mockRepo,
	}

	app.Post("/login", s.Login)

	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("Password123!"), bcrypt.DefaultCost)
	testUser := &models.User{
		ID:       1,
		Email:    "test@example.com",
		Password: string(hashedPassword),
		Username: "testuser",
	}

	tests := []struct {
		name           string
		body           map[string]string
		mockSetup      func()
		expectedStatus int
	}{
		{
			name: "Success",
			body: map[string]string{
				"email":    "test@example.com",
				"password": "Password123!",
			},
			mockSetup: func() {
				mockRepo.On("GetByEmail", mock.Anything, "test@example.com").Return(testUser, nil)
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "Invalid Credentials",
			body: map[string]string{
				"email":    "test@example.com",
				"password": "wrongpassword",
			},
			mockSetup: func() {
				mockRepo.On("GetByEmail", mock.Anything, "test@example.com").Return(testUser, nil)
			},
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockSetup()
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, _ := app.Test(req)
			defer func() { _ = resp.Body.Close() }()
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			if tt.expectedStatus == http.StatusOK {
				var result map[string]interface{}
				json.NewDecoder(resp.Body).Decode(&result)
				assert.Contains(t, result, "token")
				assert.Contains(t, result, "refresh_token")
				assert.Contains(t, result, "user")
			}
		})
	}
}

func TestRefresh(t *testing.T) {
	app := fiber.New()
	mockRepo := new(MockUserRepository)

	s := &Server{
		config:   &config.Config{JWTSecret: "test_secret"},
		userRepo: mockRepo,
	}

	app.Post("/refresh", s.Refresh)

	// Generate a valid refresh token
	refreshToken, _ := s.generateRefreshToken(1)

	tests := []struct {
		name           string
		body           map[string]string
		mockSetup      func()
		expectedStatus int
	}{
		{
			name: "Success",
			body: map[string]string{
				"refresh_token": refreshToken,
			},
			mockSetup: func() {
				mockRepo.On("GetByID", mock.Anything, uint(1)).Return(&models.User{ID: 1, Username: "testuser"}, nil)
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "Invalid Token",
			body: map[string]string{
				"refresh_token": "invalid-token",
			},
			mockSetup:      func() {},
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Missing Token",
			body:           map[string]string{},
			mockSetup:      func() {},
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockSetup()
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/refresh", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, _ := app.Test(req)
			defer func() { _ = resp.Body.Close() }()
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			if tt.expectedStatus == http.StatusOK {
				var result map[string]interface{}
				_ = json.NewDecoder(resp.Body).Decode(&result)
				assert.Contains(t, result, "token")
				assert.Contains(t, result, "refresh_token")
			}
		})
	}
}

func TestLogout(t *testing.T) {
	app := fiber.New()
	s := &Server{
		config: &config.Config{JWTSecret: "test_secret"},
	}

	app.Post("/logout", s.Logout)

	t.Run("Success", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"refresh_token": "some-token"})
		req := httptest.NewRequest(http.MethodPost, "/logout", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("Empty Token", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"refresh_token": ""})
		req := httptest.NewRequest(http.MethodPost, "/logout", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})
}
