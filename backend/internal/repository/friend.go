// Package repository provides data access layer implementations for the application.
package repository

import (
	"context"
	"errors"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

// FriendRepository defines the interface for friend data operations
type FriendRepository interface {
	Create(ctx context.Context, friendship *models.Friendship) error
	GetByID(ctx context.Context, id uint) (*models.Friendship, error)
	GetFriendshipBetweenUsers(ctx context.Context, userID1, userID2 uint) (*models.Friendship, error)
	GetFriends(ctx context.Context, userID uint) ([]models.User, error)
	GetPendingRequests(ctx context.Context, userID uint) ([]models.Friendship, error)
	GetSentRequests(ctx context.Context, userID uint) ([]models.Friendship, error)
	UpdateStatus(ctx context.Context, friendshipID uint, status models.FriendshipStatus) error
	Delete(ctx context.Context, friendshipID uint) error
	RemoveFriendship(ctx context.Context, userID1, userID2 uint) error
}

// friendRepository implements FriendRepository
type friendRepository struct {
	db *gorm.DB
}

// NewFriendRepository creates a new friend repository
func NewFriendRepository(db *gorm.DB) FriendRepository {
	return &friendRepository{db: db}
}

func (r *friendRepository) Create(ctx context.Context, friendship *models.Friendship) error {
	if err := r.db.WithContext(ctx).Create(friendship).Error; err != nil {
		return models.NewInternalError(err)
	}
	return nil
}

func (r *friendRepository) GetByID(ctx context.Context, id uint) (*models.Friendship, error) {
	var friendship models.Friendship
	if err := r.db.WithContext(ctx).Preload("Requester").Preload("Addressee").First(&friendship, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.NewNotFoundError("Friendship", id)
		}
		return nil, models.NewInternalError(err)
	}
	return &friendship, nil
}

func (r *friendRepository) GetFriendshipBetweenUsers(ctx context.Context, userID1, userID2 uint) (*models.Friendship, error) {
	var friendship models.Friendship

	// Find friendship where users are either requester/addressee in any order
	if err := r.db.WithContext(ctx).
		Where("(requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)",
			userID1, userID2, userID2, userID1).
		Preload("Requester").
		Preload("Addressee").
		First(&friendship).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // No friendship exists
		}
		return nil, models.NewInternalError(err)
	}
	return &friendship, nil
}

func (r *friendRepository) GetFriends(ctx context.Context, userID uint) ([]models.User, error) {
	var users []models.User

	// Find all accepted friendships for the user and get the other user in each friendship
	if err := r.db.WithContext(ctx).
		Table("users").
		Joins("JOIN friendships f ON (users.id = f.requester_id OR users.id = f.addressee_id)").
		Where("f.status = ? AND (f.requester_id = ? OR f.addressee_id = ?) AND users.id != ?",
			models.FriendshipStatusAccepted, userID, userID, userID).
		Find(&users).Error; err != nil {
		return nil, models.NewInternalError(err)
	}

	return users, nil
}

func (r *friendRepository) GetPendingRequests(ctx context.Context, userID uint) ([]models.Friendship, error) {
	var friendships []models.Friendship

	// Find pending requests where user is the addressee
	if err := r.db.WithContext(ctx).
		Where("addressee_id = ? AND status = ?", userID, models.FriendshipStatusPending).
		Preload("Requester").
		Preload("Addressee").
		Find(&friendships).Error; err != nil {
		return nil, models.NewInternalError(err)
	}

	return friendships, nil
}

func (r *friendRepository) GetSentRequests(ctx context.Context, userID uint) ([]models.Friendship, error) {
	var friendships []models.Friendship

	// Find pending requests where user is the requester
	if err := r.db.WithContext(ctx).
		Where("requester_id = ? AND status = ?", userID, models.FriendshipStatusPending).
		Preload("Requester").
		Preload("Addressee").
		Find(&friendships).Error; err != nil {
		return nil, models.NewInternalError(err)
	}

	return friendships, nil
}

func (r *friendRepository) UpdateStatus(ctx context.Context, friendshipID uint, status models.FriendshipStatus) error {
	if err := r.db.WithContext(ctx).
		Model(&models.Friendship{}).
		Where("id = ?", friendshipID).
		Update("status", status).Error; err != nil {
		return models.NewInternalError(err)
	}
	return nil
}

func (r *friendRepository) Delete(ctx context.Context, friendshipID uint) error {
	if err := r.db.WithContext(ctx).Delete(&models.Friendship{}, friendshipID).Error; err != nil {
		return models.NewInternalError(err)
	}
	return nil
}

func (r *friendRepository) RemoveFriendship(ctx context.Context, userID1, userID2 uint) error {
	if err := r.db.WithContext(ctx).
		Where("(requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)",
			userID1, userID2, userID2, userID1).
		Delete(&models.Friendship{}).Error; err != nil {
		return models.NewInternalError(err)
	}
	return nil
}
