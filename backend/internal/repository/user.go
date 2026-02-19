// Package repository implements the data access layer for the application.
package repository

import (
	"context"
	"errors"
	"strings"

	"sanctum/internal/cache"
	"sanctum/internal/database"
	"sanctum/internal/models"

	"gorm.io/gorm"
)

// UserRepository defines persistence operations for users.
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

type userRepository struct {
	db *gorm.DB
}

// NewUserRepository returns a new UserRepository implementation.
func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) GetByID(ctx context.Context, id uint) (*models.User, error) {
	var user models.User
	key := cache.UserKey(id)

	err := cache.Aside(ctx, key, &user, cache.UserTTL, func() error {
		readDB := database.GetReadDB()
		if readDB == nil {
			readDB = r.db
		}
		if err := readDB.WithContext(ctx).First(&user, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return models.NewNotFoundError("User", id)
			}
			return models.NewInternalError(err)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) GetByIDWithPosts(ctx context.Context, id uint, limit int) (*models.User, error) {
	var user models.User
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	readDB := database.GetReadDB()
	if readDB == nil {
		readDB = r.db
	}
	if err := readDB.WithContext(ctx).
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
	readDB := database.GetReadDB()
	if readDB == nil {
		readDB = r.db
	}
	if err := readDB.WithContext(ctx).Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, models.NewInternalError(err)
	}
	return &user, nil
}

func (r *userRepository) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	var user models.User
	readDB := database.GetReadDB()
	if readDB == nil {
		readDB = r.db
	}
	if err := readDB.WithContext(ctx).Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, models.NewInternalError(err)
	}
	return &user, nil
}

func (r *userRepository) Create(ctx context.Context, user *models.User) error {
	if err := r.db.WithContext(ctx).Create(user).Error; err != nil {
		if isUniqueConstraintError(err) {
			return models.NewValidationError("User already exists")
		}
		return models.NewInternalError(err)
	}
	return nil
}

// isUniqueConstraintError checks if a DB error is a unique constraint violation.
func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	// PostgreSQL unique violation SQLSTATE 23505
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "23505")
}

func (r *userRepository) Update(ctx context.Context, user *models.User) error {
	if err := r.db.WithContext(ctx).Save(user).Error; err != nil {
		return models.NewInternalError(err)
	}
	cache.InvalidateUser(ctx, user.ID)
	return nil
}

func (r *userRepository) Delete(ctx context.Context, id uint) error {
	if err := r.db.WithContext(ctx).Delete(&models.User{}, id).Error; err != nil {
		return models.NewInternalError(err)
	}
	cache.InvalidateUser(ctx, id)
	return nil
}

func (r *userRepository) List(ctx context.Context, limit, offset int) ([]models.User, error) {
	var users []models.User
	readDB := database.GetReadDB()
	if readDB == nil {
		readDB = r.db
	}
	if err := readDB.WithContext(ctx).Limit(limit).Offset(offset).Find(&users).Error; err != nil {
		return nil, models.NewInternalError(err)
	}
	return users, nil
}
