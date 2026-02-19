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

// commentRepoStub is a stub for repository.CommentRepository.
type commentRepoStub struct {
	createFn     func(context.Context, *models.Comment) error
	getByIDFn    func(context.Context, uint) (*models.Comment, error)
	listByPostFn func(context.Context, uint) ([]*models.Comment, error)
	updateFn     func(context.Context, *models.Comment) error
	deleteFn     func(context.Context, uint) error
}

func (s *commentRepoStub) Create(ctx context.Context, comment *models.Comment) error {
	return s.createFn(ctx, comment)
}
func (s *commentRepoStub) GetByID(ctx context.Context, id uint) (*models.Comment, error) {
	return s.getByIDFn(ctx, id)
}
func (s *commentRepoStub) ListByPost(ctx context.Context, postID uint) ([]*models.Comment, error) {
	return s.listByPostFn(ctx, postID)
}
func (s *commentRepoStub) Update(ctx context.Context, comment *models.Comment) error {
	return s.updateFn(ctx, comment)
}
func (s *commentRepoStub) Delete(ctx context.Context, id uint) error {
	return s.deleteFn(ctx, id)
}

func noopCommentRepo() *commentRepoStub {
	return &commentRepoStub{
		createFn:     func(_ context.Context, _ *models.Comment) error { return nil },
		getByIDFn:    func(_ context.Context, _ uint) (*models.Comment, error) { return &models.Comment{}, nil },
		listByPostFn: func(_ context.Context, _ uint) ([]*models.Comment, error) { return nil, nil },
		updateFn:     func(_ context.Context, _ *models.Comment) error { return nil },
		deleteFn:     func(_ context.Context, _ uint) error { return nil },
	}
}

func TestCommentService_CreateComment_Validation(t *testing.T) {
	t.Parallel()

	svc := NewCommentService(noopCommentRepo(), noopPostRepo(), nil)
	ctx := context.Background()

	t.Run("empty content", func(t *testing.T) {
		t.Parallel()
		_, err := svc.CreateComment(ctx, CreateCommentInput{UserID: 1, PostID: 1})
		assertValidationError(t, err)
	})

	t.Run("content too long", func(t *testing.T) {
		t.Parallel()
		_, err := svc.CreateComment(ctx, CreateCommentInput{
			UserID:  1,
			PostID:  1,
			Content: strings.Repeat("x", 10001),
		})
		assertValidationError(t, err)
	})

	t.Run("post not found propagates repo error", func(t *testing.T) {
		t.Parallel()
		repoErr := errors.New("post not found")
		postRepo := noopPostRepo()
		postRepo.getByIDFn = func(_ context.Context, _, _ uint) (*models.Post, error) {
			return nil, repoErr
		}
		svc2 := NewCommentService(noopCommentRepo(), postRepo, nil)
		_, err := svc2.CreateComment(ctx, CreateCommentInput{UserID: 1, PostID: 99, Content: "hi"})
		assert.ErrorIs(t, err, repoErr)
	})
}

func TestCommentService_CreateComment_Success(t *testing.T) {
	t.Parallel()

	commentRepo := noopCommentRepo()
	commentRepo.createFn = func(_ context.Context, c *models.Comment) error {
		c.ID = 42
		return nil
	}
	commentRepo.getByIDFn = func(_ context.Context, id uint) (*models.Comment, error) {
		return &models.Comment{ID: id, Content: "hello", UserID: 1, PostID: 1}, nil
	}

	svc := NewCommentService(commentRepo, noopPostRepo(), nil)
	comment, err := svc.CreateComment(context.Background(), CreateCommentInput{
		UserID:  1,
		PostID:  1,
		Content: "hello",
	})
	require.NoError(t, err)
	assert.Equal(t, uint(42), comment.ID)
	assert.Equal(t, "hello", comment.Content)
}

func TestCommentService_UpdateComment_Ownership(t *testing.T) {
	t.Parallel()

	t.Run("non-owner cannot update", func(t *testing.T) {
		t.Parallel()
		commentRepo := noopCommentRepo()
		commentRepo.getByIDFn = func(_ context.Context, _ uint) (*models.Comment, error) {
			return &models.Comment{ID: 1, UserID: 10}, nil
		}
		svc := NewCommentService(commentRepo, noopPostRepo(), nil)
		_, err := svc.UpdateComment(context.Background(), UpdateCommentInput{UserID: 1, CommentID: 1, Content: "new"})
		assertUnauthorizedError(t, err)
	})

	t.Run("empty content is invalid", func(t *testing.T) {
		t.Parallel()
		commentRepo := noopCommentRepo()
		commentRepo.getByIDFn = func(_ context.Context, _ uint) (*models.Comment, error) {
			return &models.Comment{ID: 1, UserID: 1}, nil
		}
		svc := NewCommentService(commentRepo, noopPostRepo(), nil)
		_, err := svc.UpdateComment(context.Background(), UpdateCommentInput{UserID: 1, CommentID: 1, Content: ""})
		assertValidationError(t, err)
	})

	t.Run("owner can update content", func(t *testing.T) {
		t.Parallel()
		// UpdateComment calls GetByID twice: once to fetch, once to return the fresh record.
		// The updateFn captures the new content so the second GetByID returns the updated value.
		storedContent := "old"
		commentRepo := noopCommentRepo()
		commentRepo.getByIDFn = func(_ context.Context, _ uint) (*models.Comment, error) {
			return &models.Comment{ID: 1, UserID: 1, Content: storedContent}, nil
		}
		commentRepo.updateFn = func(_ context.Context, c *models.Comment) error {
			storedContent = c.Content
			return nil
		}
		svc := NewCommentService(commentRepo, noopPostRepo(), nil)
		comment, err := svc.UpdateComment(context.Background(), UpdateCommentInput{UserID: 1, CommentID: 1, Content: "updated"})
		require.NoError(t, err)
		assert.Equal(t, "updated", comment.Content)
	})
}

func TestCommentService_DeleteComment_Ownership(t *testing.T) {
	t.Parallel()

	t.Run("owner can delete", func(t *testing.T) {
		t.Parallel()
		commentRepo := noopCommentRepo()
		commentRepo.getByIDFn = func(_ context.Context, _ uint) (*models.Comment, error) {
			return &models.Comment{ID: 1, UserID: 1}, nil
		}
		svc := NewCommentService(commentRepo, noopPostRepo(), nil)
		comment, err := svc.DeleteComment(context.Background(), DeleteCommentInput{UserID: 1, CommentID: 1})
		require.NoError(t, err)
		assert.Equal(t, uint(1), comment.ID)
	})

	t.Run("non-owner without isAdmin returns unauthorized", func(t *testing.T) {
		t.Parallel()
		commentRepo := noopCommentRepo()
		commentRepo.getByIDFn = func(_ context.Context, _ uint) (*models.Comment, error) {
			return &models.Comment{ID: 1, UserID: 10}, nil
		}
		svc := NewCommentService(commentRepo, noopPostRepo(), nil)
		_, err := svc.DeleteComment(context.Background(), DeleteCommentInput{UserID: 1, CommentID: 1})
		assertUnauthorizedError(t, err)
	})

	t.Run("admin can delete another user's comment", func(t *testing.T) {
		t.Parallel()
		commentRepo := noopCommentRepo()
		commentRepo.getByIDFn = func(_ context.Context, _ uint) (*models.Comment, error) {
			return &models.Comment{ID: 1, UserID: 10}, nil
		}
		isAdmin := func(_ context.Context, _ uint) (bool, error) { return true, nil }
		svc := NewCommentService(commentRepo, noopPostRepo(), isAdmin)
		comment, err := svc.DeleteComment(context.Background(), DeleteCommentInput{UserID: 1, CommentID: 1})
		require.NoError(t, err)
		assert.Equal(t, uint(1), comment.ID)
	})

	t.Run("isAdmin error propagates", func(t *testing.T) {
		t.Parallel()
		commentRepo := noopCommentRepo()
		commentRepo.getByIDFn = func(_ context.Context, _ uint) (*models.Comment, error) {
			return &models.Comment{ID: 1, UserID: 10}, nil
		}
		adminErr := errors.New("admin check failed")
		isAdmin := func(_ context.Context, _ uint) (bool, error) { return false, adminErr }
		svc := NewCommentService(commentRepo, noopPostRepo(), isAdmin)
		_, err := svc.DeleteComment(context.Background(), DeleteCommentInput{UserID: 1, CommentID: 1})
		assert.ErrorIs(t, err, adminErr)
	})
}
