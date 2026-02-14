package service

import (
	"context"
	"testing"

	"sanctum/internal/models"
	"sanctum/internal/repository"

	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type chatRepoStub struct {
	createConversationFn   func(context.Context, *models.Conversation) error
	getConversationFn      func(context.Context, uint) (*models.Conversation, error)
	getUserConversationsFn func(context.Context, uint) ([]*models.Conversation, error)
	addParticipantFn       func(context.Context, uint, uint) error
	removeParticipantFn    func(context.Context, uint, uint) error
	createMessageFn        func(context.Context, *models.Message) error
	getMessagesFn          func(context.Context, uint, int, int) ([]*models.Message, error)
	markMessageReadFn      func(context.Context, uint) error
	updateLastReadFn       func(context.Context, uint, uint) error
}

func (s *chatRepoStub) CreateConversation(ctx context.Context, conv *models.Conversation) error {
	return s.createConversationFn(ctx, conv)
}
func (s *chatRepoStub) GetConversation(ctx context.Context, id uint) (*models.Conversation, error) {
	return s.getConversationFn(ctx, id)
}
func (s *chatRepoStub) GetUserConversations(ctx context.Context, userID uint) ([]*models.Conversation, error) {
	return s.getUserConversationsFn(ctx, userID)
}
func (s *chatRepoStub) AddParticipant(ctx context.Context, convID, userID uint) error {
	return s.addParticipantFn(ctx, convID, userID)
}
func (s *chatRepoStub) RemoveParticipant(ctx context.Context, convID, userID uint) error {
	return s.removeParticipantFn(ctx, convID, userID)
}
func (s *chatRepoStub) CreateMessage(ctx context.Context, msg *models.Message) error {
	return s.createMessageFn(ctx, msg)
}
func (s *chatRepoStub) GetMessages(ctx context.Context, convID uint, limit, offset int) ([]*models.Message, error) {
	return s.getMessagesFn(ctx, convID, limit, offset)
}
func (s *chatRepoStub) MarkMessageRead(ctx context.Context, msgID uint) error {
	return s.markMessageReadFn(ctx, msgID)
}
func (s *chatRepoStub) UpdateLastRead(ctx context.Context, convID, userID uint) error {
	return s.updateLastReadFn(ctx, convID, userID)
}
func (s *chatRepoStub) IsUserParticipant(_ context.Context, _, _ uint) (bool, error) {
	return true, nil
}

func noopChatRepo() *chatRepoStub {
	return &chatRepoStub{
		createConversationFn:   func(context.Context, *models.Conversation) error { return nil },
		getConversationFn:      func(context.Context, uint) (*models.Conversation, error) { return &models.Conversation{}, nil },
		getUserConversationsFn: func(context.Context, uint) ([]*models.Conversation, error) { return nil, nil },
		addParticipantFn:       func(context.Context, uint, uint) error { return nil },
		removeParticipantFn:    func(context.Context, uint, uint) error { return nil },
		createMessageFn:        func(context.Context, *models.Message) error { return nil },
		getMessagesFn:          func(context.Context, uint, int, int) ([]*models.Message, error) { return nil, nil },
		markMessageReadFn:      func(context.Context, uint) error { return nil },
		updateLastReadFn:       func(context.Context, uint, uint) error { return nil },
	}
}

func TestChatService_CreateConversation_Validation(t *testing.T) {
	svc := NewChatService(noopChatRepo(), noopUserRepo(), nil, nil, nil)

	t.Run("Group without name", func(t *testing.T) {
		_, err := svc.CreateConversation(context.Background(), CreateConversationInput{
			IsGroup:        true,
			ParticipantIDs: []uint{1},
		})
		assert.Error(t, err)
		assert.Equal(t, "VALIDATION_ERROR", err.(*models.AppError).Code)
	})

	t.Run("No participants", func(t *testing.T) {
		_, err := svc.CreateConversation(context.Background(), CreateConversationInput{
			IsGroup:        false,
			ParticipantIDs: []uint{},
		})
		assert.Error(t, err)
		assert.Equal(t, "VALIDATION_ERROR", err.(*models.AppError).Code)
	})
}

func TestChatService_SendMessage_Unauthorized(t *testing.T) {
	repo := noopChatRepo()
	repo.getConversationFn = func(context.Context, uint) (*models.Conversation, error) {
		return &models.Conversation{
			ID:           1,
			Participants: []models.User{{ID: 2}}, // User 1 not in participants
		}, nil
	}

	svc := NewChatService(repo, noopUserRepo(), nil, nil, nil)

	_, _, err := svc.SendMessage(context.Background(), SendMessageInput{
		UserID:         1,
		ConversationID: 1,
		Content:        "Hello",
	})

	assert.Error(t, err)
	assert.Equal(t, "UNAUTHORIZED", err.(*models.AppError).Code)
}

func TestChatService_FullFlow(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	_ = db.AutoMigrate(&models.Conversation{}, &models.User{}, &models.ConversationParticipant{}, &models.Message{})

	repo := repository.NewChatRepository(db)
	userRepo := repository.NewUserRepository(db)
	svc := NewChatService(repo, userRepo, db, nil, nil)

	ctx := context.Background()
	u1 := &models.User{Username: "u1", Email: "u1@e.com"}
	u2 := &models.User{Username: "u2", Email: "u2@e.com"}
	db.Create(u1)
	db.Create(u2)

	t.Run("Create and Get DM", func(t *testing.T) {
		conv, err := svc.CreateConversation(ctx, CreateConversationInput{
			UserID:         u1.ID,
			IsGroup:        false,
			ParticipantIDs: []uint{u2.ID},
		})
		assert.NoError(t, err)
		assert.False(t, conv.IsGroup)

		fetched, err := svc.GetConversationForUser(ctx, conv.ID, u1.ID)
		assert.NoError(t, err)
		assert.Equal(t, conv.ID, fetched.ID)

		// Unauthorized
		_, err = svc.GetConversationForUser(ctx, conv.ID, 999)
		assert.Error(t, err)
	})

	t.Run("Send and Get Messages", func(t *testing.T) {
		conv, _ := svc.CreateConversation(ctx, CreateConversationInput{
			UserID:         u1.ID,
			IsGroup:        true,
			Name:           "Group",
			ParticipantIDs: []uint{u2.ID},
		})

		msg, _, err := svc.SendMessage(ctx, SendMessageInput{
			UserID:         u1.ID,
			ConversationID: conv.ID,
			Content:        "Hi",
		})
		assert.NoError(t, err)
		assert.Equal(t, "Hi", msg.Content)

		msgs, err := svc.GetMessagesForUser(ctx, conv.ID, u2.ID, 10, 0)
		assert.NoError(t, err)
		assert.Len(t, msgs, 1)
	})

	t.Run("Add and Leave", func(t *testing.T) {
		conv, _ := svc.CreateConversation(ctx, CreateConversationInput{
			UserID:         u1.ID,
			IsGroup:        true,
			Name:           "Group 2",
			ParticipantIDs: []uint{u2.ID},
		})

		u3 := &models.User{Username: "u3", Email: "u3@e.com"}
		db.Create(u3)

		err := svc.AddParticipant(ctx, conv.ID, u1.ID, u3.ID)
		assert.NoError(t, err)

		_, err = svc.LeaveConversation(ctx, conv.ID, u2.ID)
		assert.NoError(t, err)
	})

	t.Run("GetConversations", func(t *testing.T) {
		convs, err := svc.GetConversations(ctx, u1.ID)
		assert.NoError(t, err)
		assert.NotEmpty(t, convs)
	})
}

func TestChatService_Chatrooms(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	_ = db.AutoMigrate(&models.Conversation{}, &models.User{}, &models.ConversationParticipant{}, &models.Message{})

	repo := repository.NewChatRepository(db)
	userRepo := repository.NewUserRepository(db)
	svc := NewChatService(repo, userRepo, db, nil, nil)

	ctx := context.Background()
	u1 := &models.User{Username: "u1", Email: "u1@e.com"}
	db.Create(u1)

	room := &models.Conversation{Name: "Public", IsGroup: true, CreatedBy: u1.ID}
	db.Create(room)

	t.Run("Join and List", func(t *testing.T) {
		_, err := svc.JoinChatroom(ctx, room.ID, u1.ID)
		assert.NoError(t, err)

		joined, err := svc.GetJoinedChatrooms(ctx, u1.ID)
		assert.NoError(t, err)
		assert.Len(t, joined, 1)

		all, err := svc.GetAllChatrooms(ctx, u1.ID)
		assert.NoError(t, err)
		assert.Len(t, all, 1)
		assert.True(t, all[0].IsJoined)
	})
}

func TestChatService_RemoveParticipant_Authorization(t *testing.T) {
	repo := noopChatRepo()
	// Since RemoveParticipant uses s.db.First, we need a DB.
	// Let's use SQLite in-memory for this.
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	_ = db.AutoMigrate(&models.Conversation{}, &models.User{}, &models.ConversationParticipant{})

	conv := models.Conversation{ID: 1, IsGroup: true, CreatedBy: 2}
	db.Create(&conv)

	// Mock isAdmin to return false
	isAdmin := func(ctx context.Context, userID uint) (bool, error) {
		return false, nil
	}

	svc := NewChatService(repo, noopUserRepo(), db, isAdmin, nil)

	// User 1 tries to remove user 3 from room created by user 2
	_, err := svc.RemoveParticipant(context.Background(), 1, 1, 3)
	assert.Error(t, err)
	assert.Equal(t, "UNAUTHORIZED", err.(*models.AppError).Code)

	// Admin can remove
	isAdminAdmin := func(ctx context.Context, userID uint) (bool, error) {
		return true, nil
	}
	svcAdmin := NewChatService(repo, noopUserRepo(), db, isAdminAdmin, nil)
	_, err = svcAdmin.RemoveParticipant(context.Background(), 1, 1, 3)
	assert.NoError(t, err)
}
