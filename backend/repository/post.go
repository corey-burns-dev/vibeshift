package repository

import (
	"context"
	"vibeshift/models"

	"gorm.io/gorm"
)

// PostRepository defines the interface for post data operations
type PostRepository interface {
	Create(ctx context.Context, post *models.Post) error
	GetByID(ctx context.Context, id uint) (*models.Post, error)
	GetByUserID(ctx context.Context, userID uint, limit, offset int) ([]*models.Post, error)
	List(ctx context.Context, limit, offset int) ([]*models.Post, error)
	Update(ctx context.Context, post *models.Post) error
	Delete(ctx context.Context, id uint) error
	Like(ctx context.Context, id uint) error
	Unlike(ctx context.Context, id uint) error
}

// postRepository implements PostRepository
type postRepository struct {
	db *gorm.DB
}

// NewPostRepository creates a new post repository
func NewPostRepository(db *gorm.DB) PostRepository {
	return &postRepository{db: db}
}

func (r *postRepository) Create(ctx context.Context, post *models.Post) error {
	return r.db.WithContext(ctx).Create(post).Error
}

func (r *postRepository) GetByID(ctx context.Context, id uint) (*models.Post, error) {
	var post models.Post
	err := r.db.WithContext(ctx).Preload("User").First(&post, id).Error
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (r *postRepository) GetByUserID(ctx context.Context, userID uint, limit, offset int) ([]*models.Post, error) {
	var posts []*models.Post
	err := r.db.WithContext(ctx).
		Preload("User").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	return posts, err
}

func (r *postRepository) List(ctx context.Context, limit, offset int) ([]*models.Post, error) {
	var posts []*models.Post
	err := r.db.WithContext(ctx).
		Preload("User").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	return posts, err
}

func (r *postRepository) Update(ctx context.Context, post *models.Post) error {
	return r.db.WithContext(ctx).Save(post).Error
}

func (r *postRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Post{}, id).Error
}

func (r *postRepository) Like(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Model(&models.Post{}).Where("id = ?", id).Update("likes", gorm.Expr("likes + 1")).Error
}

func (r *postRepository) Unlike(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Model(&models.Post{}).Where("id = ?", id).Update("likes", gorm.Expr("GREATEST(likes - 1, 0)")).Error
}