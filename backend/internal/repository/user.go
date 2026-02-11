// Package repository provides data access layer implementations for the application.
package repository

import (
	"context"
	"errors"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

// UserRepository defines the interface for user data operations
type UserRepository interface {
	GetByID(ctx context.Context, id uint) (*models.User, error)
	GetByIDWithPosts(ctx context.Context, id uint, limit int) (*models.User, error)
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	GetByUsername(ctx context.Context, username string) (*models.User, error)
	Create(ctx context.Context, user *models.User) error
	Update(ctx context.Context, user *models.User) error
	Delete(ctx context.Context, id uint) error
	List(ctx context.Context, limit, offset int) ([]models.User, error)
}

// userRepository implements UserRepository
type userRepository struct {
	db *gorm.DB
}

// NewUserRepository creates a new user repository
func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) GetByID(ctx context.Context, id uint) (*models.User, error) {
	var user models.User
	// Don't preload posts by default to avoid N+1 queries
	if err := r.db.WithContext(ctx).First(&user, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.NewNotFoundError("User", id)
		}
		return nil, models.NewInternalError(err)
	}
	return &user, nil
}

// GetByIDWithPosts retrieves a user with a limited number of their posts
// Use this when you need to display user posts to avoid N+1 queries
func (r *userRepository) GetByIDWithPosts(ctx context.Context, id uint, limit int) (*models.User, error) {
	var user models.User
	if limit <= 0 {
		limit = 10 // Default to 10 posts if not specified
	}
	if limit > 100 {
		limit = 100 // Maximum 100 posts to prevent abuse
	}

	if err := r.db.WithContext(ctx).
		Preload("Posts", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Limit(limit)
		}).
		First(&user, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.NewNotFoundError("User", id)
		}
		return nil, models.NewInternalError(err)
	}
	return &user, nil
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	if err := r.db.WithContext(ctx).Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // Return nil for not found, not an error
		}
		return nil, models.NewInternalError(err)
	}
	return &user, nil
}

func (r *userRepository) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	var user models.User
	if err := r.db.WithContext(ctx).Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, models.NewInternalError(err)
	}
	return &user, nil
}

func (r *userRepository) Create(ctx context.Context, user *models.User) error {
	if err := r.db.WithContext(ctx).Create(user).Error; err != nil {
		return models.NewInternalError(err)
	}
	return nil
}

func (r *userRepository) Update(ctx context.Context, user *models.User) error {
	if err := r.db.WithContext(ctx).Save(user).Error; err != nil {
		return models.NewInternalError(err)
	}
	return nil
}

func (r *userRepository) Delete(ctx context.Context, id uint) error {
	if err := r.db.WithContext(ctx).Delete(&models.User{}, id).Error; err != nil {
		return models.NewInternalError(err)
	}
	return nil
}

func (r *userRepository) List(ctx context.Context, limit, offset int) ([]models.User, error) {
	var users []models.User
	if err := r.db.WithContext(ctx).Limit(limit).Offset(offset).Find(&users).Error; err != nil {
		return nil, models.NewInternalError(err)
	}
	return users, nil
}
