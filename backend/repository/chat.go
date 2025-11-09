package repository

import (
	"context"
	"vibeshift/models"

	"gorm.io/gorm"
)

// ChatRepository defines the interface for chat data operations
type ChatRepository interface {
	CreateConversation(ctx context.Context, conv *models.Conversation) error
	GetConversation(ctx context.Context, id uint) (*models.Conversation, error)
	GetUserConversations(ctx context.Context, userID uint) ([]*models.Conversation, error)
	AddParticipant(ctx context.Context, convID, userID uint) error
	RemoveParticipant(ctx context.Context, convID, userID uint) error
	CreateMessage(ctx context.Context, msg *models.Message) error
	GetMessages(ctx context.Context, convID uint, limit, offset int) ([]*models.Message, error)
	MarkMessageRead(ctx context.Context, msgID uint) error
	UpdateLastRead(ctx context.Context, convID, userID uint) error
}

// chatRepository implements ChatRepository
type chatRepository struct {
	db *gorm.DB
}

// NewChatRepository creates a new chat repository
func NewChatRepository(db *gorm.DB) ChatRepository {
	return &chatRepository{db: db}
}

func (r *chatRepository) CreateConversation(ctx context.Context, conv *models.Conversation) error {
	return r.db.WithContext(ctx).Create(conv).Error
}

func (r *chatRepository) GetConversation(ctx context.Context, id uint) (*models.Conversation, error) {
	var conv models.Conversation
	err := r.db.WithContext(ctx).
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC").Limit(50)
		}).
		Preload("Messages.Sender").
		First(&conv, id).Error
	if err != nil {
		return nil, err
	}
	return &conv, nil
}

func (r *chatRepository) GetUserConversations(ctx context.Context, userID uint) ([]*models.Conversation, error) {
	var conversations []*models.Conversation
	err := r.db.WithContext(ctx).
		Joins("JOIN conversation_participants cp ON conversations.id = cp.conversation_id").
		Where("cp.user_id = ?", userID).
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Limit(1)
		}).
		Preload("Messages.Sender").
		Order("conversations.updated_at DESC").
		Find(&conversations).Error
	return conversations, err
}

func (r *chatRepository) AddParticipant(ctx context.Context, convID, userID uint) error {
	participant := models.ConversationParticipant{
		ConversationID: convID,
		UserID:         userID,
	}
	return r.db.WithContext(ctx).Create(&participant).Error
}

func (r *chatRepository) RemoveParticipant(ctx context.Context, convID, userID uint) error {
	return r.db.WithContext(ctx).Where("conversation_id = ? AND user_id = ?", convID, userID).Delete(&models.ConversationParticipant{}).Error
}

func (r *chatRepository) CreateMessage(ctx context.Context, msg *models.Message) error {
	return r.db.WithContext(ctx).Create(msg).Error
}

func (r *chatRepository) GetMessages(ctx context.Context, convID uint, limit, offset int) ([]*models.Message, error) {
	var messages []*models.Message
	err := r.db.WithContext(ctx).
		Where("conversation_id = ?", convID).
		Preload("Sender").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&messages).Error
	return messages, err
}

func (r *chatRepository) MarkMessageRead(ctx context.Context, msgID uint) error {
	return r.db.WithContext(ctx).Model(&models.Message{}).Where("id = ?", msgID).Update("is_read", true).Error
}

func (r *chatRepository) UpdateLastRead(ctx context.Context, convID, userID uint) error {
	return r.db.WithContext(ctx).Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", convID, userID).
		Update("last_read_at", "NOW()").Error
}