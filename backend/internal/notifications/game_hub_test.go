package notifications

import (
	"regexp"
	"testing"

	"sanctum/internal/models"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gofiber/websocket/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupGameMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn: db,
	}), &gorm.Config{})
	require.NoError(t, err)

	return gormDB, mock
}

func TestGameHub_RegisterUnregister(t *testing.T) {
	db, mock := setupGameMockDB(t)
	hub := NewGameHub(db, nil)
	userID := uint(1)
	roomID := uint(101)
	conn := &websocket.Conn{}
	client := &Client{UserID: userID, Conn: conn}

	err := hub.RegisterClient(roomID, client)
	assert.NoError(t, err)
	hub.mu.RLock()
	assert.Equal(t, client, hub.rooms[roomID][userID])
	assert.Contains(t, hub.userRooms[userID], roomID)
	hub.mu.RUnlock()

	hub.UnregisterClient(client)
	hub.mu.RLock()
	assert.Empty(t, hub.rooms[roomID])
	assert.Empty(t, hub.userRooms[userID])
	hub.mu.RUnlock()
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestGameHub_UnregisterDoesNotHitDBForPendingCreatorDisconnect(t *testing.T) {
	db, mock := setupGameMockDB(t)
	hub := NewGameHub(db, nil)
	userID := uint(33)
	roomID := uint(404)

	client := &Client{UserID: userID, Conn: &websocket.Conn{}}
	err := hub.RegisterClient(roomID, client)
	require.NoError(t, err)

	hub.UnregisterClient(client)

	// Disconnect no longer triggers pending-room cancellation queries.
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestGameHub_HandleJoin(t *testing.T) {
	db, mock := setupGameMockDB(t)
	hub := NewGameHub(db, nil)
	userID := uint(2)
	roomID := uint(101)
	creatorID := uint(1)

	room := models.GameRoom{
		ID:        roomID,
		CreatorID: &creatorID,
		Status:    models.GamePending,
	}

	mock.ExpectQuery(`^SELECT \* FROM "game_rooms" WHERE "game_rooms"\."id" = \$1.*`).
		WithArgs(roomID, 1). // GORM adds LIMIT 1
		WillReturnRows(sqlmock.NewRows([]string{"id", "creator_id", "status"}).AddRow(room.ID, room.CreatorID, room.Status))

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE "game_rooms"`)).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	hub.handleJoin(userID, GameAction{Type: "join_room", RoomID: roomID})
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Test that when the same user has multiple client instances (e.g., multiple tabs),
// unregistering a stale client does not remove the active client's tracking.
func TestGameHub_MultipleSocketsSameUserUnregisterBehavior(t *testing.T) {
	db, mock := setupGameMockDB(t)
	hub := NewGameHub(db, nil)
	userID := uint(10)
	roomID := uint(202)

	connA := &websocket.Conn{}
	connB := &websocket.Conn{}
	clientA := &Client{UserID: userID, Conn: connA}
	clientB := &Client{UserID: userID, Conn: connB}

	// Register first client
	err := hub.RegisterClient(roomID, clientA)
	require.NoError(t, err)
	// Register second client for same user; should replace mapping in room
	err = hub.RegisterClient(roomID, clientB)
	require.NoError(t, err)

	hub.mu.RLock()
	// The room mapping for the user should point to the most recently registered client
	require.Equal(t, clientB, hub.rooms[roomID][userID])
	// userRooms should contain the room
	_, ok := hub.userRooms[userID][roomID]
	require.True(t, ok)
	hub.mu.RUnlock()

	// Unregister the first (stale) client. Because the stored client != clientA,
	// nothing should be removed.
	hub.UnregisterClient(clientA)

	hub.mu.RLock()
	// Room should still have clientB
	require.Equal(t, clientB, hub.rooms[roomID][userID])
	// userRooms should still track the room
	_, ok = hub.userRooms[userID][roomID]
	require.True(t, ok)
	hub.mu.RUnlock()

	hub.UnregisterClient(clientB)

	hub.mu.RLock()
	_, roomExists := hub.rooms[roomID]
	require.False(t, roomExists)
	_, tracked := hub.userRooms[userID]
	require.False(t, tracked)
	hub.mu.RUnlock()

	assert.NoError(t, mock.ExpectationsWereMet())
}
