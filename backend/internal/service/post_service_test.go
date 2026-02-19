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

// postRepoStub is a stub for repository.PostRepository.
type postRepoStub struct {
	createFn          func(context.Context, *models.Post) error
	getByIDFn         func(context.Context, uint, uint) (*models.Post, error)
	getByUserIDFn     func(context.Context, uint, int, int, uint) ([]*models.Post, error)
	getBySanctumIDFn  func(context.Context, uint, int, int, uint) ([]*models.Post, error)
	listFn            func(context.Context, int, int, uint) ([]*models.Post, error)
	searchFn          func(context.Context, string, int, int, uint) ([]*models.Post, error)
	updateFn          func(context.Context, *models.Post) error
	deleteFn          func(context.Context, uint) error
	isLikedFn         func(context.Context, uint, uint) (bool, error)
	getLikedPostIDsFn func(context.Context, uint, []uint) ([]uint, error)
	likeFn            func(context.Context, uint, uint) error
	unlikeFn          func(context.Context, uint, uint) error
}

func (s *postRepoStub) Create(ctx context.Context, post *models.Post) error {
	return s.createFn(ctx, post)
}
func (s *postRepoStub) GetByID(ctx context.Context, id, currentUserID uint) (*models.Post, error) {
	return s.getByIDFn(ctx, id, currentUserID)
}
func (s *postRepoStub) GetByUserID(ctx context.Context, userID uint, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	return s.getByUserIDFn(ctx, userID, limit, offset, currentUserID)
}
func (s *postRepoStub) GetBySanctumID(ctx context.Context, sanctumID uint, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	return s.getBySanctumIDFn(ctx, sanctumID, limit, offset, currentUserID)
}
func (s *postRepoStub) List(ctx context.Context, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	return s.listFn(ctx, limit, offset, currentUserID)
}
func (s *postRepoStub) Search(ctx context.Context, query string, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	return s.searchFn(ctx, query, limit, offset, currentUserID)
}
func (s *postRepoStub) Update(ctx context.Context, post *models.Post) error {
	return s.updateFn(ctx, post)
}
func (s *postRepoStub) Delete(ctx context.Context, id uint) error {
	return s.deleteFn(ctx, id)
}
func (s *postRepoStub) IsLiked(ctx context.Context, userID, postID uint) (bool, error) {
	return s.isLikedFn(ctx, userID, postID)
}
func (s *postRepoStub) GetLikedPostIDs(ctx context.Context, userID uint, postIDs []uint) ([]uint, error) {
	return s.getLikedPostIDsFn(ctx, userID, postIDs)
}
func (s *postRepoStub) Like(ctx context.Context, userID, postID uint) error {
	return s.likeFn(ctx, userID, postID)
}
func (s *postRepoStub) Unlike(ctx context.Context, userID, postID uint) error {
	return s.unlikeFn(ctx, userID, postID)
}

func noopPostRepo() *postRepoStub {
	return &postRepoStub{
		createFn:          func(_ context.Context, _ *models.Post) error { return nil },
		getByIDFn:         func(_ context.Context, _, _ uint) (*models.Post, error) { return &models.Post{}, nil },
		getByUserIDFn:     func(_ context.Context, _ uint, _, _ int, _ uint) ([]*models.Post, error) { return nil, nil },
		getBySanctumIDFn:  func(_ context.Context, _ uint, _, _ int, _ uint) ([]*models.Post, error) { return nil, nil },
		listFn:            func(_ context.Context, _, _ int, _ uint) ([]*models.Post, error) { return nil, nil },
		searchFn:          func(_ context.Context, _ string, _, _ int, _ uint) ([]*models.Post, error) { return nil, nil },
		updateFn:          func(_ context.Context, _ *models.Post) error { return nil },
		deleteFn:          func(_ context.Context, _ uint) error { return nil },
		isLikedFn:         func(_ context.Context, _, _ uint) (bool, error) { return false, nil },
		getLikedPostIDsFn: func(_ context.Context, _ uint, _ []uint) ([]uint, error) { return nil, nil },
		likeFn:            func(_ context.Context, _, _ uint) error { return nil },
		unlikeFn:          func(_ context.Context, _, _ uint) error { return nil },
	}
}

// pollRepoStub is a stub for repository.PollRepository.
type pollRepoStub struct {
	createFn            func(context.Context, uint, string, []string) (*models.Poll, error)
	voteFn              func(context.Context, uint, uint, uint) error
	enrichWithResultsFn func(context.Context, *models.Poll, uint) error
}

func (s *pollRepoStub) Create(ctx context.Context, postID uint, question string, options []string) (*models.Poll, error) {
	return s.createFn(ctx, postID, question, options)
}
func (s *pollRepoStub) Vote(ctx context.Context, userID, pollID, pollOptionID uint) error {
	return s.voteFn(ctx, userID, pollID, pollOptionID)
}
func (s *pollRepoStub) EnrichWithResults(ctx context.Context, poll *models.Poll, currentUserID uint) error {
	return s.enrichWithResultsFn(ctx, poll, currentUserID)
}

func noopPollRepo() *pollRepoStub {
	return &pollRepoStub{
		createFn:            func(_ context.Context, _ uint, _ string, _ []string) (*models.Poll, error) { return &models.Poll{}, nil },
		voteFn:              func(_ context.Context, _, _, _ uint) error { return nil },
		enrichWithResultsFn: func(_ context.Context, _ *models.Poll, _ uint) error { return nil },
	}
}

// assertValidationError asserts that err is an AppError with code VALIDATION_ERROR.
func assertValidationError(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	var appErr *models.AppError
	require.True(t, errors.As(err, &appErr), "expected AppError, got %T: %v", err, err)
	assert.Equal(t, "VALIDATION_ERROR", appErr.Code)
}

// assertUnauthorizedError asserts that err is an AppError with code UNAUTHORIZED.
func assertUnauthorizedError(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	var appErr *models.AppError
	require.True(t, errors.As(err, &appErr), "expected AppError, got %T: %v", err, err)
	assert.Equal(t, "UNAUTHORIZED", appErr.Code)
}

func TestPostService_CreatePost_Validation(t *testing.T) {
	t.Parallel()

	svc := NewPostService(noopPostRepo(), noopPollRepo(), nil)
	ctx := context.Background()

	tests := []struct {
		name  string
		input CreatePostInput
	}{
		{
			name:  "empty title",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeText, Content: "some content"},
		},
		{
			name:  "invalid post type",
			input: CreatePostInput{UserID: 1, Title: "T", PostType: "banana"},
		},
		{
			name:  "title too long",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeText, Title: strings.Repeat("x", 301), Content: "c"},
		},
		{
			name:  "content too long",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeText, Title: "T", Content: strings.Repeat("x", 50001)},
		},
		{
			name:  "text post missing content",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeText, Title: "T"},
		},
		{
			name:  "media post missing image_url",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeMedia, Title: "T"},
		},
		{
			name:  "video post missing youtube_url",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeVideo, Title: "T"},
		},
		{
			name:  "video post invalid youtube_url",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeVideo, Title: "T", YoutubeURL: "https://vimeo.com/123"},
		},
		{
			name:  "link post missing link_url",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeLink, Title: "T"},
		},
		{
			name:  "link post invalid link_url",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypeLink, Title: "T", LinkURL: "not-a-url"},
		},
		{
			name:  "poll missing question",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypePoll, Title: "T", Poll: &CreatePostPollInput{Options: []string{"A", "B"}}},
		},
		{
			name:  "poll with only one option",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypePoll, Title: "T", Poll: &CreatePostPollInput{Question: "Q?", Options: []string{"A"}}},
		},
		{
			name:  "poll with all blank options",
			input: CreatePostInput{UserID: 1, PostType: models.PostTypePoll, Title: "T", Poll: &CreatePostPollInput{Question: "Q?", Options: []string{"  ", " "}}},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := svc.CreatePost(ctx, tc.input)
			assertValidationError(t, err)
		})
	}
}

func TestPostService_CreatePost_PollCallsRepo(t *testing.T) {
	t.Parallel()

	pollCreated := false
	pr := noopPollRepo()
	pr.createFn = func(_ context.Context, _ uint, _ string, _ []string) (*models.Poll, error) {
		pollCreated = true
		return &models.Poll{}, nil
	}
	svc := NewPostService(noopPostRepo(), pr, nil)

	_, err := svc.CreatePost(context.Background(), CreatePostInput{
		UserID:   1,
		Title:    "My Poll",
		PostType: models.PostTypePoll,
		Poll:     &CreatePostPollInput{Question: "Best option?", Options: []string{"Alpha", "Beta"}},
	})
	assert.NoError(t, err)
	assert.True(t, pollCreated, "expected pollRepo.Create to be called for poll post")
}

func TestPostService_DeletePost_Ownership(t *testing.T) {
	t.Parallel()

	t.Run("owner can delete", func(t *testing.T) {
		t.Parallel()
		repo := noopPostRepo()
		repo.getByIDFn = func(_ context.Context, _, _ uint) (*models.Post, error) {
			return &models.Post{ID: 1, UserID: 1}, nil
		}
		svc := NewPostService(repo, nil, nil)
		err := svc.DeletePost(context.Background(), DeletePostInput{UserID: 1, PostID: 1})
		assert.NoError(t, err)
	})

	t.Run("non-owner without isAdmin returns unauthorized", func(t *testing.T) {
		t.Parallel()
		repo := noopPostRepo()
		repo.getByIDFn = func(_ context.Context, _, _ uint) (*models.Post, error) {
			return &models.Post{ID: 1, UserID: 10}, nil
		}
		svc := NewPostService(repo, nil, nil)
		err := svc.DeletePost(context.Background(), DeletePostInput{UserID: 1, PostID: 1})
		assertUnauthorizedError(t, err)
	})

	t.Run("admin can delete another user's post", func(t *testing.T) {
		t.Parallel()
		repo := noopPostRepo()
		repo.getByIDFn = func(_ context.Context, _, _ uint) (*models.Post, error) {
			return &models.Post{ID: 1, UserID: 10}, nil
		}
		isAdmin := func(_ context.Context, _ uint) (bool, error) { return true, nil }
		svc := NewPostService(repo, nil, isAdmin)
		err := svc.DeletePost(context.Background(), DeletePostInput{UserID: 1, PostID: 1})
		assert.NoError(t, err)
	})

	t.Run("non-admin cannot delete another user's post", func(t *testing.T) {
		t.Parallel()
		repo := noopPostRepo()
		repo.getByIDFn = func(_ context.Context, _, _ uint) (*models.Post, error) {
			return &models.Post{ID: 1, UserID: 10}, nil
		}
		isAdmin := func(_ context.Context, _ uint) (bool, error) { return false, nil }
		svc := NewPostService(repo, nil, isAdmin)
		err := svc.DeletePost(context.Background(), DeletePostInput{UserID: 1, PostID: 1})
		assertUnauthorizedError(t, err)
	})
}

func TestPostService_UpdatePost_Ownership(t *testing.T) {
	t.Parallel()

	t.Run("non-owner cannot update", func(t *testing.T) {
		t.Parallel()
		repo := noopPostRepo()
		repo.getByIDFn = func(_ context.Context, _, _ uint) (*models.Post, error) {
			return &models.Post{ID: 1, UserID: 10}, nil
		}
		svc := NewPostService(repo, nil, nil)
		_, err := svc.UpdatePost(context.Background(), UpdatePostInput{UserID: 1, PostID: 1, Title: "new"})
		assertUnauthorizedError(t, err)
	})

	t.Run("owner can update title", func(t *testing.T) {
		t.Parallel()
		repo := noopPostRepo()
		repo.getByIDFn = func(_ context.Context, _, _ uint) (*models.Post, error) {
			return &models.Post{ID: 1, UserID: 1, Title: "old"}, nil
		}
		svc := NewPostService(repo, nil, nil)
		post, err := svc.UpdatePost(context.Background(), UpdatePostInput{UserID: 1, PostID: 1, Title: "new"})
		require.NoError(t, err)
		assert.Equal(t, "new", post.Title)
	})
}

func TestPostService_SearchPosts_EmptyQuery(t *testing.T) {
	t.Parallel()
	svc := NewPostService(noopPostRepo(), nil, nil)
	_, err := svc.SearchPosts(context.Background(), "", 10, 0, 0)
	assertValidationError(t, err)
}

func TestIsYouTubeURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		url  string
		want bool
	}{
		{"https://www.youtube.com/watch?v=abc123", true},
		{"https://youtu.be/abc123", true},
		{"http://youtube.com/embed/abc123", true},
		{"https://vimeo.com/123456", false},
		{"https://example.com/video", false},
		{"not-a-url", false},
		{"", false},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.url, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.want, isYouTubeURL(tc.url))
		})
	}
}

func TestExtractImageHash(t *testing.T) {
	t.Parallel()

	hash := strings.Repeat("a", 64)
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"media path", "/media/i/" + hash + "/thumb", hash},
		{"api images path", "/api/images/" + hash + "/original", hash},
		{"full url media path", "https://cdn.example.com/media/i/" + hash + "/thumb", hash},
		{"hash too short", "/media/i/tooshort/thumb", ""},
		{"empty string", "", ""},
		{"unrelated url", "https://example.com/other/path", ""},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.want, extractImageHash(tc.input))
		})
	}
}
