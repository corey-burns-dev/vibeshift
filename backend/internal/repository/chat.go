package repository

import (
	"context"

	"sanctum/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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
		Select("conversations.*, COALESCE(cp.unread_count, 0) as unread_count").
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
	// Use OnConflict to silently ignore duplicate key errors
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&participant).Error
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
	if err != nil {
		return nil, err
	}

	// Reverse messages to return them in chronological order (oldest -> newest)
	// We fetched DESC to get the *latest* messages, but client expects ASC
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, nil
}

func (r *chatRepository) MarkMessageRead(ctx context.Context, msgID uint) error {
	return r.db.WithContext(ctx).Model(&models.Message{}).Where("id = ?", msgID).Update("is_read", true).Error
}

func (r *chatRepository) UpdateLastRead(ctx context.Context, convID, userID uint) error {
	return r.db.WithContext(ctx).Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", convID, userID).
		Update("last_read_at", "NOW()").Error
}
