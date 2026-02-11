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

// MockChatRepository is a mock of the ChatRepository interface
type MockChatRepository struct {
	mock.Mock
}

func (m *MockChatRepository) CreateConversation(ctx context.Context, conv *models.Conversation) error {
	args := m.Called(ctx, conv)
	return args.Error(0)
}

func (m *MockChatRepository) GetConversation(ctx context.Context, id uint) (*models.Conversation, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Conversation), args.Error(1)
}

func (m *MockChatRepository) GetUserConversations(ctx context.Context, userID uint) ([]*models.Conversation, error) {
	args := m.Called(ctx, userID)
	return args.Get(0).([]*models.Conversation), args.Error(1)
}

func (m *MockChatRepository) AddParticipant(ctx context.Context, convID, userID uint) error {
	args := m.Called(ctx, convID, userID)
	return args.Error(0)
}

func (m *MockChatRepository) RemoveParticipant(ctx context.Context, convID, userID uint) error {
	args := m.Called(ctx, convID, userID)
	return args.Error(0)
}

func (m *MockChatRepository) CreateMessage(ctx context.Context, msg *models.Message) error {
	args := m.Called(ctx, msg)
	return args.Error(0)
}

func (m *MockChatRepository) GetMessages(ctx context.Context, convID uint, limit, offset int) ([]*models.Message, error) {
	args := m.Called(ctx, convID, limit, offset)
	return args.Get(0).([]*models.Message), args.Error(1)
}

func (m *MockChatRepository) MarkMessageRead(ctx context.Context, msgID uint) error {
	args := m.Called(ctx, msgID)
	return args.Error(0)
}

func (m *MockChatRepository) UpdateLastRead(ctx context.Context, convID, userID uint) error {
	args := m.Called(ctx, convID, userID)
	return args.Error(0)
}

func TestCreateConversation(t *testing.T) {
	app := fiber.New()
	mockChatRepo := new(MockChatRepository)
	s := &Server{chatRepo: mockChatRepo}

	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return c.Next()
	})
	app.Post("/conversations", s.CreateConversation)

	tests := []struct {
		name           string
		body           map[string]interface{}
		mockSetup      func()
		expectedStatus int
	}{
		{
			name: "Success",
			body: map[string]interface{}{
				"participant_ids": []uint{2},
			},
			mockSetup: func() {
				mockChatRepo.On("CreateConversation", mock.Anything, mock.Anything).Return(nil)
				mockChatRepo.On("AddParticipant", mock.Anything, mock.Anything, uint(1)).Return(nil)
				mockChatRepo.On("AddParticipant", mock.Anything, mock.Anything, uint(2)).Return(nil)
				mockChatRepo.On("GetConversation", mock.Anything, mock.Anything).Return(&models.Conversation{ID: 1}, nil)
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Missing Participants",
			body: map[string]interface{}{
				"participant_ids": []uint{},
			},
			mockSetup:      func() {},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockSetup()
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/conversations", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			resp, _ := app.Test(req)
			defer func() { _ = resp.Body.Close() }()
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
		})
	}
}
