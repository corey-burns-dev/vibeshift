package repository

import (
	"context"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

// StreamRepository defines the interface for stream data operations
type StreamRepository interface {
	CreateStream(ctx context.Context, stream *models.Stream) error
	GetStreamByID(ctx context.Context, id uint) (*models.Stream, error)
	GetStreamsByUserID(ctx context.Context, userID uint) ([]*models.Stream, error)
	GetLiveStreams(ctx context.Context, category string, limit, offset int) ([]*models.Stream, int64, error)
	UpdateStream(ctx context.Context, stream *models.Stream) error
	DeleteStream(ctx context.Context, id uint) error
	SetStreamLive(ctx context.Context, id uint, isLive bool) error
	IncrementViewerCount(ctx context.Context, id uint) error
	DecrementViewerCount(ctx context.Context, id uint) error
	// Stream messages
	CreateStreamMessage(ctx context.Context, msg *models.StreamMessage) error
	GetStreamMessages(ctx context.Context, streamID uint, limit, offset int) ([]*models.StreamMessage, error)
}

// streamRepository implements StreamRepository
type streamRepository struct {
	db *gorm.DB
}

// NewStreamRepository creates a new stream repository
func NewStreamRepository(db *gorm.DB) StreamRepository {
	return &streamRepository{db: db}
}

func (r *streamRepository) CreateStream(ctx context.Context, stream *models.Stream) error {
	return r.db.WithContext(ctx).Create(stream).Error
}

func (r *streamRepository) GetStreamByID(ctx context.Context, id uint) (*models.Stream, error) {
	var stream models.Stream
	err := r.db.WithContext(ctx).
		Preload("User").
		First(&stream, id).Error
	if err != nil {
		return nil, err
	}
	return &stream, nil
}

func (r *streamRepository) GetStreamsByUserID(ctx context.Context, userID uint) ([]*models.Stream, error) {
	var streams []*models.Stream
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Preload("User").
		Order("created_at DESC").
		Find(&streams).Error
	return streams, err
}

func (r *streamRepository) GetLiveStreams(ctx context.Context, category string, limit, offset int) ([]*models.Stream, int64, error) {
	var streams []*models.Stream
	var total int64

	query := r.db.WithContext(ctx).Model(&models.Stream{}).Where("is_live = ?", true)

	if category != "" {
		query = query.Where("category = ?", category)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	err := query.
		Preload("User").
		Order("viewer_count DESC, started_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&streams).Error

	return streams, total, err
}

func (r *streamRepository) UpdateStream(ctx context.Context, stream *models.Stream) error {
	return r.db.WithContext(ctx).Save(stream).Error
}

func (r *streamRepository) DeleteStream(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Stream{}, id).Error
}

func (r *streamRepository) SetStreamLive(ctx context.Context, id uint, isLive bool) error {
	updates := map[string]any{"is_live": isLive}
	if isLive {
		updates["started_at"] = gorm.Expr("NOW()")
	} else {
		updates["ended_at"] = gorm.Expr("NOW()")
		updates["viewer_count"] = 0
	}
	return r.db.WithContext(ctx).Model(&models.Stream{}).Where("id = ?", id).Updates(updates).Error
}

func (r *streamRepository) IncrementViewerCount(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Model(&models.Stream{}).Where("id = ?", id).
		UpdateColumn("viewer_count", gorm.Expr("viewer_count + 1")).Error
}

func (r *streamRepository) DecrementViewerCount(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Model(&models.Stream{}).Where("id = ? AND viewer_count > 0", id).
		UpdateColumn("viewer_count", gorm.Expr("viewer_count - 1")).Error
}

func (r *streamRepository) CreateStreamMessage(ctx context.Context, msg *models.StreamMessage) error {
	return r.db.WithContext(ctx).Create(msg).Error
}

func (r *streamRepository) GetStreamMessages(ctx context.Context, streamID uint, limit, offset int) ([]*models.StreamMessage, error) {
	var messages []*models.StreamMessage
	err := r.db.WithContext(ctx).
		Where("stream_id = ?", streamID).
		Preload("User").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&messages).Error
	if err != nil {
		return nil, err
	}

	// Reverse to return chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, nil
}
