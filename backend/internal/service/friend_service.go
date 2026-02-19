package service

import (
	"context"

	"sanctum/internal/models"
	"sanctum/internal/repository"
)

// FriendService provides friend-request and friendship business logic.
type FriendService struct {
	friendRepo repository.FriendRepository
	userRepo   repository.UserRepository
}

// NewFriendService returns a new FriendService.
func NewFriendService(friendRepo repository.FriendRepository, userRepo repository.UserRepository) *FriendService {
	return &FriendService{
		friendRepo: friendRepo,
		userRepo:   userRepo,
	}
}

// SendFriendRequest sends a friend request to the target user.
func (s *FriendService) SendFriendRequest(ctx context.Context, userID, targetUserID uint) (*models.Friendship, error) {
	if userID == targetUserID {
		return nil, models.NewValidationError("Cannot send friend request to yourself")
	}

	if _, err := s.userRepo.GetByID(ctx, targetUserID); err != nil {
		return nil, err
	}

	existing, err := s.friendRepo.GetFriendshipBetweenUsers(ctx, userID, targetUserID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		switch existing.Status {
		case models.FriendshipStatusAccepted:
			return nil, models.NewValidationError("You are already friends")
		case models.FriendshipStatusPending:
			if existing.RequesterID == userID {
				return nil, models.NewValidationError("Friend request already sent")
			}
			return nil, models.NewValidationError("You already have a pending friend request from this user")
		}
	}

	friendship := &models.Friendship{
		RequesterID: userID,
		AddresseeID: targetUserID,
		Status:      models.FriendshipStatusPending,
	}
	if err := s.friendRepo.Create(ctx, friendship); err != nil {
		return nil, err
	}

	return s.friendRepo.GetByID(ctx, friendship.ID)
}

// GetPendingRequests returns pending friend requests for the user.
func (s *FriendService) GetPendingRequests(ctx context.Context, userID uint) ([]models.Friendship, error) {
	return s.friendRepo.GetPendingRequests(ctx, userID)
}

// GetSentRequests returns friend requests sent by the user.
func (s *FriendService) GetSentRequests(ctx context.Context, userID uint) ([]models.Friendship, error) {
	return s.friendRepo.GetSentRequests(ctx, userID)
}

// AcceptFriendRequest accepts a pending friend request.
func (s *FriendService) AcceptFriendRequest(ctx context.Context, userID, requestID uint) (*models.Friendship, error) {
	friendship, err := s.friendRepo.GetByID(ctx, requestID)
	if err != nil {
		return nil, err
	}

	if friendship.AddresseeID != userID {
		return nil, models.NewUnauthorizedError("You can only accept friend requests sent to you")
	}
	if friendship.Status != models.FriendshipStatusPending {
		return nil, models.NewValidationError("Friend request is not pending")
	}

	if err := s.friendRepo.UpdateStatus(ctx, requestID, models.FriendshipStatusAccepted); err != nil {
		return nil, err
	}

	return s.friendRepo.GetByID(ctx, requestID)
}

// RejectFriendRequest rejects or cancels a pending friend request.
func (s *FriendService) RejectFriendRequest(ctx context.Context, userID, requestID uint) (*models.Friendship, error) {
	friendship, err := s.friendRepo.GetByID(ctx, requestID)
	if err != nil {
		return nil, err
	}

	if friendship.AddresseeID != userID && friendship.RequesterID != userID {
		return nil, models.NewUnauthorizedError("You can only reject or cancel your own pending requests")
	}
	if friendship.Status != models.FriendshipStatusPending {
		return nil, models.NewValidationError("Friend request is not pending")
	}

	if err := s.friendRepo.Delete(ctx, requestID); err != nil {
		return nil, err
	}

	return friendship, nil
}

// GetFriends returns the list of friends for the user.
func (s *FriendService) GetFriends(ctx context.Context, userID uint) ([]models.User, error) {
	return s.friendRepo.GetFriends(ctx, userID)
}

// GetFriendshipStatus returns the friendship status between two users.
func (s *FriendService) GetFriendshipStatus(ctx context.Context, userID, targetUserID uint) (string, uint, *models.Friendship, error) {
	if _, err := s.userRepo.GetByID(ctx, targetUserID); err != nil {
		return "", 0, nil, err
	}

	friendship, err := s.friendRepo.GetFriendshipBetweenUsers(ctx, userID, targetUserID)
	if err != nil {
		return "", 0, nil, err
	}

	status := "none"
	var requestID uint
	if friendship != nil {
		switch friendship.Status {
		case models.FriendshipStatusAccepted:
			status = "friends"
		case models.FriendshipStatusPending:
			requestID = friendship.ID
			if friendship.RequesterID == userID {
				status = "pending_sent"
			} else {
				status = "pending_received"
			}
		default:
			status = string(friendship.Status)
		}
	}

	return status, requestID, friendship, nil
}

// RemoveFriend removes the friendship between two users.
func (s *FriendService) RemoveFriend(ctx context.Context, userID, targetUserID uint) (*models.Friendship, error) {
	friendship, err := s.friendRepo.GetFriendshipBetweenUsers(ctx, userID, targetUserID)
	if err != nil {
		return nil, err
	}
	if friendship == nil || friendship.Status != models.FriendshipStatusAccepted {
		return nil, models.NewNotFoundError("Friendship", 0)
	}

	if err := s.friendRepo.RemoveFriendship(ctx, userID, targetUserID); err != nil {
		return nil, err
	}
	return friendship, nil
}
