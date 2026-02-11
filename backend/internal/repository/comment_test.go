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

func TestCommentRepository_Integration(t *testing.T) {
	repo := NewCommentRepository(testDB)
	ctx := context.Background()

	// Setup user and post
	ts := time.Now().UnixNano()
	user := &models.User{Username: fmt.Sprintf("cuser_%d", ts), Email: fmt.Sprintf("cuser_%d@e.com", ts)}
	testDB.Create(user)
	post := &models.Post{Title: "Comment Test", Content: "x", UserID: user.ID}
	testDB.Create(post)

	t.Run("Create and ListByPost", func(t *testing.T) {
		comment := &models.Comment{
			Content: "Nice post!",
			PostID:  post.ID,
			UserID:  user.ID,
		}

		err := repo.Create(ctx, comment)
		require.NoError(t, err)
		assert.NotZero(t, comment.ID)

		comments, err := repo.ListByPost(ctx, post.ID)
		assert.NoError(t, err)
		assert.Len(t, comments, 1)
		assert.Equal(t, "Nice post!", comments[0].Content)
		assert.Equal(t, user.Username, comments[0].User.Username)
	})

	t.Run("Update and Delete", func(t *testing.T) {
		comment := &models.Comment{Content: "Old", PostID: post.ID, UserID: user.ID}
		repo.Create(ctx, comment)

		comment.Content = "New"
		err := repo.Update(ctx, comment)
		assert.NoError(t, err)

		fetched, _ := repo.GetByID(ctx, comment.ID)
		assert.Equal(t, "New", fetched.Content)

		err = repo.Delete(ctx, comment.ID)
		assert.NoError(t, err)

		_, err = repo.GetByID(ctx, comment.ID)
		assert.Error(t, err)
	})
}
