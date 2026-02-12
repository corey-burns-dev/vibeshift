package repository

import (
	"context"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/observability"

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
	db     *gorm.DB
	logger *observability.RepoLogger
}

// NewChatRepository creates a new chat repository
func NewChatRepository(db *gorm.DB) ChatRepository {
	return &chatRepository{
		db:     db,
		logger: observability.NewRepoLogger("conversations"),
	}
}

func (r *chatRepository) CreateConversation(ctx context.Context, conv *models.Conversation) error {
	start := time.Now()
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("create", "conversations").Observe(time.Since(start).Seconds())
	}()
	err := r.db.WithContext(ctx).Create(conv).Error
	if err != nil {
		r.logger.LogError(ctx, err, "create_conversation")
		return err
	}
	r.logger.LogCreate(ctx, map[string]interface{}{"conversation_id": conv.ID})
	return nil
}

func (r *chatRepository) GetConversation(ctx context.Context, id uint) (*models.Conversation, error) {
	start := time.Now()
	var conv models.Conversation
	err := r.db.WithContext(ctx).
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC").Limit(50)
		}).
		Preload("Messages.Sender").
		First(&conv, id).Error
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("read", "conversations").Observe(time.Since(start).Seconds())
	}()
	if err != nil {
		r.logger.LogError(ctx, err, "get_conversation")
		return nil, err
	}
	r.logger.LogRead(ctx, map[string]interface{}{"conversation_id": id})
	return &conv, nil
}

func (r *chatRepository) GetUserConversations(ctx context.Context, userID uint) ([]*models.Conversation, error) {
	start := time.Now()
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
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("read", "conversations").Observe(time.Since(start).Seconds())
	}()
	if err != nil {
		r.logger.LogError(ctx, err, "get_user_conversations")
		return nil, err
	}
	r.logger.LogRead(ctx, map[string]interface{}{"user_id": userID, "count": len(conversations)})
	return conversations, err
}

func (r *chatRepository) AddParticipant(ctx context.Context, convID, userID uint) error {
	start := time.Now()
	participant := models.ConversationParticipant{
		ConversationID: convID,
		UserID:         userID,
	}
	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&participant).Error
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("create", "conversation_participants").Observe(time.Since(start).Seconds())
	}()
	if err != nil {
		r.logger.LogError(ctx, err, "add_participant")
		return err
	}
	r.logger.LogCreate(ctx, map[string]interface{}{"conversation_id": convID, "user_id": userID})
	return nil
}

func (r *chatRepository) RemoveParticipant(ctx context.Context, convID, userID uint) error {
	start := time.Now()
	err := r.db.WithContext(ctx).Where("conversation_id = ? AND user_id = ?", convID, userID).Delete(&models.ConversationParticipant{}).Error
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("delete", "conversation_participants").Observe(time.Since(start).Seconds())
	}()
	if err != nil {
		r.logger.LogError(ctx, err, "remove_participant")
		return err
	}
	r.logger.LogDelete(ctx, map[string]interface{}{"conversation_id": convID, "user_id": userID})
	return nil
}

func (r *chatRepository) CreateMessage(ctx context.Context, msg *models.Message) error {
	start := time.Now()
	err := r.db.WithContext(ctx).Create(msg).Error
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("create", "messages").Observe(time.Since(start).Seconds())
	}()
	if err != nil {
		r.logger.LogError(ctx, err, "create_message")
		return err
	}
	r.logger.LogCreate(ctx, map[string]interface{}{"message_id": msg.ID, "conversation_id": msg.ConversationID})
	return nil
}

func (r *chatRepository) GetMessages(ctx context.Context, convID uint, limit, offset int) ([]*models.Message, error) {
	start := time.Now()
	var messages []*models.Message
	err := r.db.WithContext(ctx).
		Where("conversation_id = ?", convID).
		Preload("Sender").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&messages).Error
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("read", "messages").Observe(time.Since(start).Seconds())
	}()
	if err != nil {
		r.logger.LogError(ctx, err, "get_messages")
		return nil, err
	}

	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	r.logger.LogRead(ctx, map[string]interface{}{"conversation_id": convID, "count": len(messages)})
	return messages, nil
}

func (r *chatRepository) MarkMessageRead(ctx context.Context, msgID uint) error {
	start := time.Now()
	err := r.db.WithContext(ctx).Model(&models.Message{}).Where("id = ?", msgID).Update("is_read", true).Error
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("update", "messages").Observe(time.Since(start).Seconds())
	}()
	if err != nil {
		r.logger.LogError(ctx, err, "mark_message_read")
		return err
	}
	r.logger.LogUpdate(ctx, map[string]interface{}{"message_id": msgID})
	return nil
}

func (r *chatRepository) UpdateLastRead(ctx context.Context, convID, userID uint) error {
	start := time.Now()
	err := r.db.WithContext(ctx).Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", convID, userID).
		Update("last_read_at", "NOW()").Error
	defer func() {
		observability.DatabaseQueryLatency.WithLabelValues("update", "conversation_participants").Observe(time.Since(start).Seconds())
	}()
	if err != nil {
		r.logger.LogError(ctx, err, "update_last_read")
		return err
	}
	r.logger.LogUpdate(ctx, map[string]interface{}{"conversation_id": convID, "user_id": userID})
	return nil
}
