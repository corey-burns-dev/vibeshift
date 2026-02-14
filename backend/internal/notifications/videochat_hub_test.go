package notifications

import (
	"testing"

	"github.com/gofiber/websocket/v2"
	"github.com/stretchr/testify/assert"
)

func TestVideoChatHub_JoinLeave(t *testing.T) {
	hub := NewVideoChatHub()
	roomID := "room1"
	userID := uint(1)
	var conn *websocket.Conn

	hub.Join(roomID, userID, "user1", conn)
	hub.mu.RLock()
	assert.Len(t, hub.rooms[roomID], 1)
	assert.Equal(t, userID, hub.rooms[roomID][userID].UserID)
	hub.mu.RUnlock()

	hub.Leave(roomID, userID)
	hub.mu.RLock()
	assert.Nil(t, hub.rooms[roomID])
	hub.mu.RUnlock()
}

func TestVideoChatHub_Limits(t *testing.T) {
	hub := NewVideoChatHub()
	roomID := "fullroom"

	for i := uint(1); i <= MaxPeersPerRoom; i++ {
		hub.Join(roomID, i, "user", nil)
	}

	// Next join should fail (log will show it, but we can check count)
	hub.Join(roomID, MaxPeersPerRoom+1, "user", nil)

	hub.mu.RLock()
	assert.Len(t, hub.rooms[roomID], MaxPeersPerRoom)
	hub.mu.RUnlock()
}
