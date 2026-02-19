package service

import (
	"context"

	"sanctum/internal/models"
	"sanctum/internal/repository"
)

// UserService provides user and profile business logic.
type UserService struct {
	userRepo repository.UserRepository
}

// UpdateProfileInput is the input for updating a user profile.
type UpdateProfileInput struct {
	UserID   uint
	Username string
	Bio      string
	Avatar   string
}

// NewUserService returns a new UserService.
func NewUserService(userRepo repository.UserRepository) *UserService {
	return &UserService{userRepo: userRepo}
}

// ListUsers returns a paginated list of users.
func (s *UserService) ListUsers(ctx context.Context, limit, offset int) ([]models.User, error) {
	return s.userRepo.List(ctx, limit, offset)
}

// GetUserByID returns a user by ID.
func (s *UserService) GetUserByID(ctx context.Context, id uint) (*models.User, error) {
	return s.userRepo.GetByID(ctx, id)
}

// UpdateProfile updates the user profile (username, bio, avatar).
func (s *UserService) UpdateProfile(ctx context.Context, in UpdateProfileInput) (*models.User, error) {
	user, err := s.userRepo.GetByID(ctx, in.UserID)
	if err != nil {
		return nil, err
	}

	const maxBioLen = 500
	const maxUsernameLen = 30

	if in.Username != "" {
		if len(in.Username) > maxUsernameLen {
			return nil, models.NewValidationError("Username too long (max 30 characters)")
		}
		user.Username = in.Username
	}
	if in.Bio != "" {
		if len(in.Bio) > maxBioLen {
			return nil, models.NewValidationError("Bio too long (max 500 characters)")
		}
		user.Bio = in.Bio
	}
	if in.Avatar != "" {
		user.Avatar = in.Avatar
	}

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

// SetAdmin sets or unsets the admin flag for a user.
func (s *UserService) SetAdmin(ctx context.Context, targetID uint, isAdmin bool) (*models.User, error) {
	user, err := s.userRepo.GetByID(ctx, targetID)
	if err != nil {
		return nil, err
	}

	user.IsAdmin = isAdmin
	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}
