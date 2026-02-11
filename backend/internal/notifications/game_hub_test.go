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

	hub.Register(userID, roomID, conn)
	hub.mu.RLock()
	assert.Equal(t, conn, hub.rooms[roomID][userID])
	assert.Contains(t, hub.userRooms[userID], roomID)
	hub.mu.RUnlock()

	// Unregister checks DB for creator cleanup
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "game_rooms" WHERE "game_rooms"."id" = $1`)).
		WithArgs(roomID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(roomID))

	hub.Unregister(userID, roomID, conn)
	hub.mu.RLock()
	assert.Empty(t, hub.rooms[roomID])
	assert.Empty(t, hub.userRooms[userID])
	hub.mu.RUnlock()
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
		CreatorID: creatorID,
		Status:    models.GamePending,
	}

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "game_rooms" WHERE "game_rooms"."id" = $1`)).
		WithArgs(roomID, 1). // GORM adds LIMIT 1
		WillReturnRows(sqlmock.NewRows([]string{"id", "creator_id", "status"}).AddRow(room.ID, room.CreatorID, room.Status))

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE "game_rooms"`)).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	hub.handleJoin(userID, GameAction{Type: "join_room", RoomID: roomID})
	assert.NoError(t, mock.ExpectationsWereMet())
}
