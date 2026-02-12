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

func TestUserRepository_Integration(t *testing.T) {
	repo := NewUserRepository(testDB)
	ctx := context.Background()

	t.Run("Create and GetByID", func(t *testing.T) {
		ts := time.Now().UnixNano()
		user := &models.User{
			Username: fmt.Sprintf("user_%d", ts),
			Email:    fmt.Sprintf("user_%d@example.com", ts),
			Password: "hashedpassword",
		}

		err := repo.Create(ctx, user)
		require.NoError(t, err)
		assert.NotZero(t, user.ID)

		fetched, err := repo.GetByID(ctx, user.ID)
		assert.NoError(t, err)
		assert.Equal(t, user.Username, fetched.Username)
		assert.Equal(t, user.Email, fetched.Email)
	})

	t.Run("GetByEmail and GetByUsername", func(t *testing.T) {
		ts := time.Now().UnixNano()
		email := fmt.Sprintf("find_%d@example.com", ts)
		username := fmt.Sprintf("find_%d", ts)
		user := &models.User{
			Username: username,
			Email:    email,
			Password: "hashedpassword",
		}
		repo.Create(ctx, user)

		byEmail, err := repo.GetByEmail(ctx, email)
		assert.NoError(t, err)
		assert.Equal(t, user.ID, byEmail.ID)

		byUsername, err := repo.GetByUsername(ctx, username)
		assert.NoError(t, err)
		assert.Equal(t, user.ID, byUsername.ID)
	})

	t.Run("GetByIDWithPosts", func(t *testing.T) {
		ts := time.Now().UnixNano()
		user := &models.User{
			Username: fmt.Sprintf("posts_%d", ts),
			Email:    fmt.Sprintf("posts_%d@example.com", ts),
			Password: "hashedpassword",
		}
		repo.Create(ctx, user)

		// Create some posts
		postRepo := NewPostRepository(testDB)
		for i := 1; i <= 3; i++ {
			postRepo.Create(ctx, &models.Post{
				Title:   fmt.Sprintf("Post %d", i),
				Content: "Content",
				UserID:  user.ID,
			})
		}

		fetched, err := repo.GetByIDWithPosts(ctx, user.ID, 2)
		assert.NoError(t, err)
		assert.Len(t, fetched.Posts, 2)                   // Limited to 2
		assert.Equal(t, "Post 3", fetched.Posts[0].Title) // Ordered by DESC
	})

	t.Run("Update and Delete", func(t *testing.T) {
		ts := time.Now().UnixNano()
		user := &models.User{
			Username: fmt.Sprintf("upd_%d", ts),
			Email:    fmt.Sprintf("upd_%d@example.com", ts),
			Password: "hashedpassword",
		}
		repo.Create(ctx, user)

		user.Bio = "New Bio"
		err := repo.Update(ctx, user)
		assert.NoError(t, err)

		fetched, _ := repo.GetByID(ctx, user.ID)
		assert.Equal(t, "New Bio", fetched.Bio)

		err = repo.Delete(ctx, user.ID)
		assert.NoError(t, err)

		_, err = repo.GetByID(ctx, user.ID)
		assert.Error(t, err) // Should be Not Found
	})
}
