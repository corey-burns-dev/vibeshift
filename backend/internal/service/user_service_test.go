package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"sanctum/internal/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// userRepoStub and noopUserRepo are defined in friend_service_test.go (same package).

func TestUserService_UpdateProfile_Validation(t *testing.T) {
	t.Parallel()

	t.Run("username too long", func(t *testing.T) {
		t.Parallel()
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, id uint) (*models.User, error) {
			return &models.User{ID: id, Username: "original"}, nil
		}
		svc := NewUserService(repo)
		_, err := svc.UpdateProfile(context.Background(), UpdateProfileInput{
			UserID:   1,
			Username: strings.Repeat("x", 31),
		})
		assertValidationError(t, err)
	})

	t.Run("bio too long", func(t *testing.T) {
		t.Parallel()
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, id uint) (*models.User, error) {
			return &models.User{ID: id}, nil
		}
		svc := NewUserService(repo)
		_, err := svc.UpdateProfile(context.Background(), UpdateProfileInput{
			UserID: 1,
			Bio:    strings.Repeat("x", 501),
		})
		assertValidationError(t, err)
	})
}

func TestUserService_UpdateProfile_PartialUpdate(t *testing.T) {
	t.Parallel()

	t.Run("only username changes when bio is empty", func(t *testing.T) {
		t.Parallel()
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, id uint) (*models.User, error) {
			return &models.User{ID: id, Username: "old", Bio: "my bio"}, nil
		}
		var saved *models.User
		repo.updateFn = func(_ context.Context, u *models.User) error {
			saved = u
			return nil
		}
		svc := NewUserService(repo)
		user, err := svc.UpdateProfile(context.Background(), UpdateProfileInput{
			UserID:   1,
			Username: "newname",
		})
		require.NoError(t, err)
		assert.Equal(t, "newname", user.Username)
		assert.Equal(t, "my bio", user.Bio, "bio should be unchanged when not provided")
		require.NotNil(t, saved)
		assert.Equal(t, "newname", saved.Username)
	})

	t.Run("only bio changes when username is empty", func(t *testing.T) {
		t.Parallel()
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, id uint) (*models.User, error) {
			return &models.User{ID: id, Username: "myuser", Bio: "old bio"}, nil
		}
		svc := NewUserService(repo)
		user, err := svc.UpdateProfile(context.Background(), UpdateProfileInput{
			UserID: 1,
			Bio:    "new bio",
		})
		require.NoError(t, err)
		assert.Equal(t, "myuser", user.Username, "username should be unchanged when not provided")
		assert.Equal(t, "new bio", user.Bio)
	})
}

func TestUserService_UpdateProfile_RepoError(t *testing.T) {
	t.Parallel()

	t.Run("GetByID error propagates", func(t *testing.T) {
		t.Parallel()
		repoErr := errors.New("db connection error")
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, _ uint) (*models.User, error) {
			return nil, repoErr
		}
		svc := NewUserService(repo)
		_, err := svc.UpdateProfile(context.Background(), UpdateProfileInput{UserID: 1, Username: "new"})
		assert.ErrorIs(t, err, repoErr)
	})

	t.Run("Update error propagates", func(t *testing.T) {
		t.Parallel()
		repoErr := errors.New("update failed")
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, id uint) (*models.User, error) {
			return &models.User{ID: id}, nil
		}
		repo.updateFn = func(_ context.Context, _ *models.User) error {
			return repoErr
		}
		svc := NewUserService(repo)
		_, err := svc.UpdateProfile(context.Background(), UpdateProfileInput{UserID: 1, Username: "new"})
		assert.ErrorIs(t, err, repoErr)
	})
}

func TestUserService_SetAdmin(t *testing.T) {
	t.Parallel()

	t.Run("sets admin flag to true", func(t *testing.T) {
		t.Parallel()
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, id uint) (*models.User, error) {
			return &models.User{ID: id, IsAdmin: false}, nil
		}
		var saved *models.User
		repo.updateFn = func(_ context.Context, u *models.User) error {
			saved = u
			return nil
		}
		svc := NewUserService(repo)
		user, err := svc.SetAdmin(context.Background(), 5, true)
		require.NoError(t, err)
		assert.True(t, user.IsAdmin)
		require.NotNil(t, saved)
		assert.True(t, saved.IsAdmin)
	})

	t.Run("unsets admin flag to false", func(t *testing.T) {
		t.Parallel()
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, id uint) (*models.User, error) {
			return &models.User{ID: id, IsAdmin: true}, nil
		}
		svc := NewUserService(repo)
		user, err := svc.SetAdmin(context.Background(), 5, false)
		require.NoError(t, err)
		assert.False(t, user.IsAdmin)
	})

	t.Run("user not found propagates error", func(t *testing.T) {
		t.Parallel()
		repoErr := errors.New("user not found")
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, _ uint) (*models.User, error) {
			return nil, repoErr
		}
		svc := NewUserService(repo)
		_, err := svc.SetAdmin(context.Background(), 99, true)
		assert.ErrorIs(t, err, repoErr)
	})
}

func TestUserService_GetUserByID(t *testing.T) {
	t.Parallel()

	t.Run("returns user from repo", func(t *testing.T) {
		t.Parallel()
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, id uint) (*models.User, error) {
			return &models.User{ID: id, Username: "alice"}, nil
		}
		svc := NewUserService(repo)
		user, err := svc.GetUserByID(context.Background(), 7)
		require.NoError(t, err)
		assert.Equal(t, uint(7), user.ID)
		assert.Equal(t, "alice", user.Username)
	})

	t.Run("repo error propagates", func(t *testing.T) {
		t.Parallel()
		repoErr := errors.New("not found")
		repo := noopUserRepo()
		repo.getByIDFn = func(_ context.Context, _ uint) (*models.User, error) {
			return nil, repoErr
		}
		svc := NewUserService(repo)
		_, err := svc.GetUserByID(context.Background(), 99)
		assert.ErrorIs(t, err, repoErr)
	})
}
