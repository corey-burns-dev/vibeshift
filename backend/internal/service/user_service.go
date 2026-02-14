package service

import (
	"context"

	"sanctum/internal/models"
	"sanctum/internal/repository"
)

type UserService struct {
	userRepo repository.UserRepository
}

type UpdateProfileInput struct {
	UserID   uint
	Username string
	Bio      string
	Avatar   string
}

func NewUserService(userRepo repository.UserRepository) *UserService {
	return &UserService{userRepo: userRepo}
}

func (s *UserService) ListUsers(ctx context.Context, limit, offset int) ([]models.User, error) {
	return s.userRepo.List(ctx, limit, offset)
}

func (s *UserService) GetUserByID(ctx context.Context, id uint) (*models.User, error) {
	return s.userRepo.GetByID(ctx, id)
}

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
