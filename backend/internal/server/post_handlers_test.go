package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockPostRepository is a mock of the PostRepository interface
type MockPostRepository struct {
	mock.Mock
}

func (m *MockPostRepository) Create(ctx context.Context, post *models.Post) error {
	args := m.Called(ctx, post)
	return args.Error(0)
}

func (m *MockPostRepository) GetByID(ctx context.Context, id uint, currentUserID uint) (*models.Post, error) {
	args := m.Called(ctx, id, currentUserID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Post), args.Error(1)
}

func (m *MockPostRepository) GetByUserID(ctx context.Context, userID uint, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	args := m.Called(ctx, userID, limit, offset, currentUserID)
	return args.Get(0).([]*models.Post), args.Error(1)
}

func (m *MockPostRepository) List(ctx context.Context, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	args := m.Called(ctx, limit, offset, currentUserID)
	return args.Get(0).([]*models.Post), args.Error(1)
}

func (m *MockPostRepository) Search(ctx context.Context, query string, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	args := m.Called(ctx, query, limit, offset, currentUserID)
	return args.Get(0).([]*models.Post), args.Error(1)
}

func (m *MockPostRepository) Update(ctx context.Context, post *models.Post) error {
	args := m.Called(ctx, post)
	return args.Error(0)
}

func (m *MockPostRepository) Delete(ctx context.Context, id uint) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockPostRepository) Like(ctx context.Context, userID, postID uint) error {
	args := m.Called(ctx, userID, postID)
	return args.Error(0)
}

func (m *MockPostRepository) Unlike(ctx context.Context, userID, postID uint) error {
	args := m.Called(ctx, userID, postID)
	return args.Error(0)
}

func TestCreatePost(t *testing.T) {
	app := fiber.New()
	mockRepo := new(MockPostRepository)
	s := &Server{postRepo: mockRepo}

	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return c.Next()
	})
	app.Post("/posts", s.CreatePost)

	tests := []struct {
		name           string
		body           map[string]string
		mockSetup      func()
		expectedStatus int
	}{
		{
			name: "Success",
			body: map[string]string{
				"title":   "New Post",
				"content": "Hello world",
			},
			mockSetup: func() {
				mockRepo.On("Create", mock.Anything, mock.Anything).Return(nil)
				mockRepo.On("GetByID", mock.Anything, mock.Anything, uint(1)).Return(&models.Post{ID: 1, Title: "New Post"}, nil)
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Missing Fields",
			body: map[string]string{
				"title": "",
			},
			mockSetup:      func() {},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockSetup()
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/posts", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, _ := app.Test(req)
			defer func() { _ = resp.Body.Close() }()
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
		})
	}
}
