package server

import (
	"testing"
	"time"

	"sanctum/internal/models"

	"github.com/stretchr/testify/assert"
)

func TestIsPendingRoomStale(t *testing.T) {
	now := time.Now()

	t.Run("pending room older than max idle is stale", func(t *testing.T) {
		room := models.GameRoom{
			Status:    models.GamePending,
			UpdatedAt: now.Add(-(pendingRoomMaxIdle + time.Second)),
		}
		assert.True(t, isPendingRoomStale(room, now))
	})

	t.Run("recent pending room is not stale", func(t *testing.T) {
		room := models.GameRoom{
			Status:    models.GamePending,
			UpdatedAt: now.Add(-(pendingRoomMaxIdle - time.Second)),
		}
		assert.False(t, isPendingRoomStale(room, now))
	})

	t.Run("non-pending room is never stale by this rule", func(t *testing.T) {
		room := models.GameRoom{
			Status:    models.GameCancelled,
			UpdatedAt: now.Add(-24 * time.Hour),
		}
		assert.False(t, isPendingRoomStale(room, now))
	})
}
