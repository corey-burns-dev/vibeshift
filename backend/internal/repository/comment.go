// Package repository provides data access layer implementations for the application.
package repository

import (
	"context"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

// CommentRepository defines interface for comment operations
type CommentRepository interface {
	Create(ctx context.Context, comment *models.Comment) error
	GetByID(ctx context.Context, id uint) (*models.Comment, error)
	ListByPost(ctx context.Context, postID uint) ([]*models.Comment, error)
	Update(ctx context.Context, comment *models.Comment) error
	Delete(ctx context.Context, id uint) error
}

type commentRepository struct {
	db *gorm.DB
}

// NewCommentRepository creates a new CommentRepository
func NewCommentRepository(db *gorm.DB) CommentRepository {
	return &commentRepository{db: db}
}

func (r *commentRepository) Create(ctx context.Context, comment *models.Comment) error {
	return r.db.WithContext(ctx).Create(comment).Error
}

func (r *commentRepository) GetByID(ctx context.Context, id uint) (*models.Comment, error) {
	var comment models.Comment
	if err := r.db.WithContext(ctx).Preload("User").First(&comment, id).Error; err != nil {
		return nil, err
	}
	return &comment, nil
}

func (r *commentRepository) ListByPost(
	ctx context.Context,
	postID uint,
) ([]*models.Comment, error) {
	var comments []*models.Comment
	err := r.db.WithContext(ctx).Preload("User").Where("post_id = ?", postID).Order("created_at desc").Find(&comments).Error
	return comments, err
}

func (r *commentRepository) Update(ctx context.Context, comment *models.Comment) error {
	return r.db.WithContext(ctx).Save(comment).Error
}

func (r *commentRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Comment{}, id).Error
}
