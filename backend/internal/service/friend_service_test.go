package service

import (
	"context"
	"errors"
	"testing"

	"sanctum/internal/models"
)

type friendRepoStub struct {
	createFn                    func(context.Context, *models.Friendship) error
	getByIDFn                   func(context.Context, uint) (*models.Friendship, error)
	getFriendshipBetweenUsersFn func(context.Context, uint, uint) (*models.Friendship, error)
	getFriendsFn                func(context.Context, uint) ([]models.User, error)
	getPendingRequestsFn        func(context.Context, uint) ([]models.Friendship, error)
	getSentRequestsFn           func(context.Context, uint) ([]models.Friendship, error)
	updateStatusFn              func(context.Context, uint, models.FriendshipStatus) error
	deleteFn                    func(context.Context, uint) error
	removeFriendshipFn          func(context.Context, uint, uint) error
}

func (s *friendRepoStub) Create(ctx context.Context, friendship *models.Friendship) error {
	return s.createFn(ctx, friendship)
}
func (s *friendRepoStub) GetByID(ctx context.Context, id uint) (*models.Friendship, error) {
	return s.getByIDFn(ctx, id)
}
func (s *friendRepoStub) GetFriendshipBetweenUsers(ctx context.Context, userID1, userID2 uint) (*models.Friendship, error) {
	return s.getFriendshipBetweenUsersFn(ctx, userID1, userID2)
}
func (s *friendRepoStub) GetFriends(ctx context.Context, userID uint) ([]models.User, error) {
	return s.getFriendsFn(ctx, userID)
}
func (s *friendRepoStub) GetPendingRequests(ctx context.Context, userID uint) ([]models.Friendship, error) {
	return s.getPendingRequestsFn(ctx, userID)
}
func (s *friendRepoStub) GetSentRequests(ctx context.Context, userID uint) ([]models.Friendship, error) {
	return s.getSentRequestsFn(ctx, userID)
}
func (s *friendRepoStub) UpdateStatus(ctx context.Context, friendshipID uint, status models.FriendshipStatus) error {
	return s.updateStatusFn(ctx, friendshipID, status)
}
func (s *friendRepoStub) Delete(ctx context.Context, friendshipID uint) error {
	return s.deleteFn(ctx, friendshipID)
}
func (s *friendRepoStub) RemoveFriendship(ctx context.Context, userID1, userID2 uint) error {
	return s.removeFriendshipFn(ctx, userID1, userID2)
}

type userRepoStub struct {
	getByIDFn          func(context.Context, uint) (*models.User, error)
	getByIDWithPostsFn func(context.Context, uint, int) (*models.User, error)
	getByEmailFn       func(context.Context, string) (*models.User, error)
	getByUsernameFn    func(context.Context, string) (*models.User, error)
	createFn           func(context.Context, *models.User) error
	updateFn           func(context.Context, *models.User) error
	deleteFn           func(context.Context, uint) error
	listFn             func(context.Context, int, int) ([]models.User, error)
	searchFn           func(context.Context, string, int, int) ([]models.User, error)
}

func (s *userRepoStub) GetByID(ctx context.Context, id uint) (*models.User, error) {
	return s.getByIDFn(ctx, id)
}
func (s *userRepoStub) GetByIDWithPosts(ctx context.Context, id uint, limit int) (*models.User, error) {
	return s.getByIDWithPostsFn(ctx, id, limit)
}
func (s *userRepoStub) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	return s.getByEmailFn(ctx, email)
}
func (s *userRepoStub) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	return s.getByUsernameFn(ctx, username)
}
func (s *userRepoStub) Create(ctx context.Context, user *models.User) error {
	return s.createFn(ctx, user)
}
func (s *userRepoStub) Update(ctx context.Context, user *models.User) error {
	return s.updateFn(ctx, user)
}
func (s *userRepoStub) Delete(ctx context.Context, id uint) error {
	return s.deleteFn(ctx, id)
}
func (s *userRepoStub) List(ctx context.Context, limit, offset int) ([]models.User, error) {
	return s.listFn(ctx, limit, offset)
}
func (s *userRepoStub) Search(ctx context.Context, q string, limit, offset int) ([]models.User, error) {
	return s.searchFn(ctx, q, limit, offset)
}

func noopUserRepo() *userRepoStub {
	return &userRepoStub{
		getByIDFn:          func(context.Context, uint) (*models.User, error) { return &models.User{}, nil },
		getByIDWithPostsFn: func(context.Context, uint, int) (*models.User, error) { return &models.User{}, nil },
		getByEmailFn:       func(context.Context, string) (*models.User, error) { return &models.User{}, nil },
		getByUsernameFn:    func(context.Context, string) (*models.User, error) { return &models.User{}, nil },
		createFn:           func(context.Context, *models.User) error { return nil },
		updateFn:           func(context.Context, *models.User) error { return nil },
		deleteFn:           func(context.Context, uint) error { return nil },
		listFn:             func(context.Context, int, int) ([]models.User, error) { return nil, nil },
		searchFn:           func(context.Context, string, int, int) ([]models.User, error) { return nil, nil },
	}
}

func noopFriendRepo() *friendRepoStub {
	return &friendRepoStub{
		createFn:                    func(context.Context, *models.Friendship) error { return nil },
		getByIDFn:                   func(context.Context, uint) (*models.Friendship, error) { return &models.Friendship{}, nil },
		getFriendshipBetweenUsersFn: func(context.Context, uint, uint) (*models.Friendship, error) { return nil, nil },
		getFriendsFn:                func(context.Context, uint) ([]models.User, error) { return nil, nil },
		getPendingRequestsFn:        func(context.Context, uint) ([]models.Friendship, error) { return nil, nil },
		getSentRequestsFn:           func(context.Context, uint) ([]models.Friendship, error) { return nil, nil },
		updateStatusFn:              func(context.Context, uint, models.FriendshipStatus) error { return nil },
		deleteFn:                    func(context.Context, uint) error { return nil },
		removeFriendshipFn:          func(context.Context, uint, uint) error { return nil },
	}
}

func TestFriendServiceSendFriendRequestSelf(t *testing.T) {
	svc := NewFriendService(noopFriendRepo(), noopUserRepo())
	_, err := svc.SendFriendRequest(context.Background(), 3, 3)
	if err == nil {
		t.Fatal("expected validation error")
	}
	var appErr *models.AppError
	if !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected validation app error, got %#v", err)
	}
}

func TestFriendServiceAcceptUnauthorized(t *testing.T) {
	repo := noopFriendRepo()
	repo.getByIDFn = func(context.Context, uint) (*models.Friendship, error) {
		return &models.Friendship{
			ID:          5,
			RequesterID: 10,
			AddresseeID: 11,
			Status:      models.FriendshipStatusPending,
		}, nil
	}

	svc := NewFriendService(repo, noopUserRepo())
	_, err := svc.AcceptFriendRequest(context.Background(), 12, 5)
	if err == nil {
		t.Fatal("expected unauthorized error")
	}
	var appErr *models.AppError
	if !errors.As(err, &appErr) || appErr.Code != "UNAUTHORIZED" {
		t.Fatalf("expected unauthorized app error, got %#v", err)
	}
}

func TestFriendServiceRemoveFriendNotAccepted(t *testing.T) {
	repo := noopFriendRepo()
	repo.getFriendshipBetweenUsersFn = func(context.Context, uint, uint) (*models.Friendship, error) {
		return &models.Friendship{
			ID:     9,
			Status: models.FriendshipStatusPending,
		}, nil
	}

	svc := NewFriendService(repo, noopUserRepo())
	_, err := svc.RemoveFriend(context.Background(), 1, 2)
	if err == nil {
		t.Fatal("expected not-found error")
	}
	var appErr *models.AppError
	if !errors.As(err, &appErr) || appErr.Code != "NOT_FOUND" {
		t.Fatalf("expected not-found app error, got %#v", err)
	}
}
