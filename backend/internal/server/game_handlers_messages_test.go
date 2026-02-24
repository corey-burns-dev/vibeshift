package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/service"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetGameRoomMessages_ReturnsPersistedMessages(t *testing.T) {
	db, mock := setupMockDB(t)
	roomID := uint(55)

	repo := noopServerGameRepo()
	repo.getRoomFn = func(id uint) (*models.GameRoom, error) {
		return &models.GameRoom{ID: id}, nil
	}

	s := &Server{
		db:          db,
		gameService: service.NewGameService(repo),
	}

	now := time.Now().UTC()
	rows := sqlmock.NewRows([]string{
		"id",
		"created_at",
		"game_room_id",
		"user_id",
		"username",
		"text",
	}).
		AddRow(1, now, roomID, 7, "alice", "first").
		AddRow(2, now.Add(time.Second), roomID, 8, "bob", "second")

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "game_room_messages" WHERE game_room_id = $1 ORDER BY created_at ASC LIMIT $2`)).
		WithArgs(roomID, models.MaxGameRoomMessages).
		WillReturnRows(rows)

	app := fiber.New()
	app.Get("/games/rooms/:id/messages", s.GetGameRoomMessages)

	req := httptest.NewRequest(http.MethodGet, "/games/rooms/55/messages", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var messages []models.GameRoomMessage
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&messages))
	require.Len(t, messages, 2)
	require.Equal(t, uint(1), messages[0].ID)
	require.Equal(t, "first", messages[0].Text)
	require.Equal(t, uint(2), messages[1].ID)
	require.Equal(t, "second", messages[1].Text)

	require.NoError(t, mock.ExpectationsWereMet())
}

func TestGetGameRoomMessages_ReturnsNotFoundWhenRoomMissing(t *testing.T) {
	db, mock := setupMockDB(t)

	repo := noopServerGameRepo()
	repo.getRoomFn = func(uint) (*models.GameRoom, error) {
		return nil, gorm.ErrRecordNotFound
	}

	s := &Server{
		db:          db,
		gameService: service.NewGameService(repo),
	}

	app := fiber.New()
	app.Get("/games/rooms/:id/messages", s.GetGameRoomMessages)

	req := httptest.NewRequest(http.MethodGet, "/games/rooms/999/messages", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusNotFound, resp.StatusCode)

	require.NoError(t, mock.ExpectationsWereMet())
}

func TestGetGameRoomMessages_ReturnsInternalErrorWhenQueryFails(t *testing.T) {
	db, mock := setupMockDB(t)
	roomID := uint(23)

	repo := noopServerGameRepo()
	repo.getRoomFn = func(id uint) (*models.GameRoom, error) {
		return &models.GameRoom{ID: id}, nil
	}

	s := &Server{
		db:          db,
		gameService: service.NewGameService(repo),
	}

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "game_room_messages" WHERE game_room_id = $1 ORDER BY created_at ASC LIMIT $2`)).
		WithArgs(roomID, models.MaxGameRoomMessages).
		WillReturnError(errors.New("query failed"))

	app := fiber.New()
	app.Get("/games/rooms/:id/messages", s.GetGameRoomMessages)

	req := httptest.NewRequest(http.MethodGet, "/games/rooms/23/messages", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	require.NoError(t, mock.ExpectationsWereMet())
}
