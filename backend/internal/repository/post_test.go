package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"sanctum/internal/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostRepository_Integration(t *testing.T) {
	repo := NewPostRepository(testDB)
	ctx := context.Background()

	// Setup a user for posts
	ts := time.Now().UnixNano()
	user := &models.User{Username: fmt.Sprintf("puser_%d", ts), Email: fmt.Sprintf("puser_%d@e.com", ts)}
	testDB.Create(user)

	t.Run("Create and GetByID", func(t *testing.T) {
		post := &models.Post{
			Title:   "Integration Post",
			Content: "This is content",
			UserID:  user.ID,
		}

		err := repo.Create(ctx, post)
		require.NoError(t, err)
		assert.NotZero(t, post.ID)

		fetched, err := repo.GetByID(ctx, post.ID, user.ID)
		assert.NoError(t, err)
		assert.Equal(t, post.Title, fetched.Title)
		assert.Equal(t, user.ID, fetched.UserID)
	})

	t.Run("Like and Unlike", func(t *testing.T) {
		post := &models.Post{Title: "Like Test", Content: "x", UserID: user.ID}
		require.NoError(t, repo.Create(ctx, post))

		err := repo.Like(ctx, user.ID, post.ID)
		assert.NoError(t, err)

		isLiked, err := repo.IsLiked(ctx, user.ID, post.ID)
		assert.NoError(t, err)
		assert.True(t, isLiked)

		fetched, err := repo.GetByID(ctx, post.ID, user.ID)
		assert.NoError(t, err)
		assert.Equal(t, 1, fetched.LikesCount)
		assert.True(t, fetched.Liked)

		err = repo.Unlike(ctx, user.ID, post.ID)
		assert.NoError(t, err)

		isLiked, err = repo.IsLiked(ctx, user.ID, post.ID)
		assert.NoError(t, err)
		assert.False(t, isLiked)
	})

	t.Run("Search and List", func(t *testing.T) {
		require.NoError(t, repo.Create(ctx, &models.Post{Title: "Go Programming", Content: "Rocks", UserID: user.ID}))
		require.NoError(t, repo.Create(ctx, &models.Post{Title: "Rust Programming", Content: "Fast", UserID: user.ID}))

		posts, err := repo.Search(ctx, "Programming", 10, 0, user.ID)
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(posts), 2)

		all, err := repo.List(ctx, 10, 0, user.ID, "new")
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(all), 2)
	})
}
