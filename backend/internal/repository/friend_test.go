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

func TestFriendRepository_Integration(t *testing.T) {
	repo := NewFriendRepository(testDB)
	ctx := context.Background()

	// Setup users
	ts := time.Now().UnixNano()
	u1 := &models.User{Username: fmt.Sprintf("f1_%d", ts), Email: fmt.Sprintf("f1_%d@e.com", ts)}
	u2 := &models.User{Username: fmt.Sprintf("f2_%d", ts), Email: fmt.Sprintf("f2_%d@e.com", ts)}
	testDB.Create(u1)
	testDB.Create(u2)

	t.Run("Create and GetPendingRequests", func(t *testing.T) {
		friendship := &models.Friendship{
			RequesterID: u1.ID,
			AddresseeID: u2.ID,
			Status:      models.FriendshipStatusPending,
		}

		err := repo.Create(ctx, friendship)
		require.NoError(t, err)

		reqs, err := repo.GetPendingRequests(ctx, u2.ID)
		assert.NoError(t, err)
		assert.Len(t, reqs, 1)
		assert.Equal(t, u1.ID, reqs[0].RequesterID)
	})

	t.Run("UpdateStatus and GetFriends", func(t *testing.T) {
		f, _ := repo.GetFriendshipBetweenUsers(ctx, u1.ID, u2.ID)
		err := repo.UpdateStatus(ctx, f.ID, models.FriendshipStatusAccepted)
		assert.NoError(t, err)

		friends, err := repo.GetFriends(ctx, u1.ID)
		assert.NoError(t, err)
		assert.Len(t, friends, 1)
		assert.Equal(t, u2.Username, friends[0].Username)
	})

	t.Run("Delete", func(t *testing.T) {
		f, _ := repo.GetFriendshipBetweenUsers(ctx, u1.ID, u2.ID)
		err := repo.Delete(ctx, f.ID)
		assert.NoError(t, err)

		friends, _ := repo.GetFriends(ctx, u1.ID)
		assert.Empty(t, friends)
	})
}
