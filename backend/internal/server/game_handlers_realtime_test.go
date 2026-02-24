package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/notifications"
	"sanctum/internal/service"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/require"
)

type gameRepoStub struct {
	getRoomFn           func(uint) (*models.GameRoom, error)
	updateRoomFn        func(*models.GameRoom) error
	createRoomFn        func(*models.GameRoom) error
	getAllActiveRoomsFn func() ([]models.GameRoom, error)
	getActiveRoomsFn    func(models.GameType) ([]models.GameRoom, error)
	getPendingRoomFn    func(models.GameType, uint) (*models.GameRoom, error)
	createMoveFn        func(*models.GameMove) error
	getMovesFn          func(uint) ([]models.GameMove, error)
	getStatsFn          func(uint, models.GameType) (*models.GameStats, error)
	updateStatsFn       func(*models.GameStats) error
}

func noopServerGameRepo() *gameRepoStub {
	return &gameRepoStub{
		getRoomFn:           func(uint) (*models.GameRoom, error) { return &models.GameRoom{}, nil },
		updateRoomFn:        func(*models.GameRoom) error { return nil },
		createRoomFn:        func(*models.GameRoom) error { return nil },
		getAllActiveRoomsFn: func() ([]models.GameRoom, error) { return []models.GameRoom{}, nil },
		getActiveRoomsFn:    func(models.GameType) ([]models.GameRoom, error) { return []models.GameRoom{}, nil },
		getPendingRoomFn:    func(models.GameType, uint) (*models.GameRoom, error) { return nil, nil },
		createMoveFn:        func(*models.GameMove) error { return nil },
		getMovesFn:          func(uint) ([]models.GameMove, error) { return []models.GameMove{}, nil },
		getStatsFn:          func(uint, models.GameType) (*models.GameStats, error) { return &models.GameStats{}, nil },
		updateStatsFn:       func(*models.GameStats) error { return nil },
	}
}

func (s *gameRepoStub) CreateRoom(room *models.GameRoom) error {
	return s.createRoomFn(room)
}

func (s *gameRepoStub) GetRoom(id uint) (*models.GameRoom, error) {
	return s.getRoomFn(id)
}

func (s *gameRepoStub) UpdateRoom(room *models.GameRoom) error {
	return s.updateRoomFn(room)
}

func (s *gameRepoStub) GetAllActiveRooms() ([]models.GameRoom, error) {
	return s.getAllActiveRoomsFn()
}

func (s *gameRepoStub) GetActiveRooms(gameType models.GameType) ([]models.GameRoom, error) {
	return s.getActiveRoomsFn(gameType)
}

func (s *gameRepoStub) GetPendingRoomByCreator(gameType models.GameType, creatorID uint) (*models.GameRoom, error) {
	return s.getPendingRoomFn(gameType, creatorID)
}

func (s *gameRepoStub) CreateMove(move *models.GameMove) error {
	return s.createMoveFn(move)
}

func (s *gameRepoStub) GetMoves(roomID uint) ([]models.GameMove, error) {
	return s.getMovesFn(roomID)
}

func (s *gameRepoStub) GetStats(userID uint, gameType models.GameType) (*models.GameStats, error) {
	return s.getStatsFn(userID, gameType)
}

func (s *gameRepoStub) UpdateStats(stats *models.GameStats) error {
	return s.updateStatsFn(stats)
}

func readAction(t *testing.T, client *notifications.Client) map[string]any {
	t.Helper()

	select {
	case msg := <-client.Send:
		var payload map[string]any
		require.NoError(t, json.Unmarshal(msg, &payload))
		return payload
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected websocket message")
		return nil
	}
}

func assertNoAction(t *testing.T, client *notifications.Client) {
	t.Helper()

	select {
	case msg := <-client.Send:
		t.Fatalf("expected no websocket message, received: %s", string(msg))
	default:
	}
}

func TestLeaveGameRoomPublishesRealtimeUpdateToOriginalParticipants(t *testing.T) {
	creatorID := uint(41)
	opponentID := uint(77)
	roomID := uint(19)

	repo := noopServerGameRepo()
	room := &models.GameRoom{
		ID:         roomID,
		Type:       models.ConnectFour,
		Status:     models.GameActive,
		CreatorID:  &creatorID,
		OpponentID: &opponentID,
		NextTurnID: creatorID,
	}
	repo.getRoomFn = func(_ uint) (*models.GameRoom, error) {
		copied := *room
		return &copied, nil
	}
	repo.updateRoomFn = func(updated *models.GameRoom) error {
		room = updated
		return nil
	}

	hub := notifications.NewHub()
	defer func() {
		_ = hub.Shutdown(context.Background())
	}()

	creatorClient, err := hub.Register(creatorID, nil)
	require.NoError(t, err)
	opponentClient, err := hub.Register(opponentID, nil)
	require.NoError(t, err)
	outsiderClient, err := hub.Register(999, nil)
	require.NoError(t, err)

	s := &Server{
		gameService: service.NewGameService(repo),
		hub:         hub,
	}

	app := fiber.New()
	app.Post("/games/rooms/:id/leave", func(c *fiber.Ctx) error {
		c.Locals("userID", creatorID)
		return s.LeaveGameRoom(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/games/rooms/19/leave", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	creatorAction := readAction(t, creatorClient)
	opponentAction := readAction(t, opponentClient)
	assertNoAction(t, outsiderClient)

	require.Equal(t, EventGameRoomUpdated, creatorAction["type"])
	require.Equal(t, EventGameRoomUpdated, opponentAction["type"])

	creatorPayload, ok := creatorAction["payload"].(map[string]any)
	require.True(t, ok)
	opponentPayload, ok := opponentAction["payload"].(map[string]any)
	require.True(t, ok)

	require.Equal(t, float64(roomID), creatorPayload["room_id"])
	require.Equal(t, float64(roomID), opponentPayload["room_id"])
	require.Equal(t, string(models.GameCancelled), creatorPayload["status"])
	require.Equal(t, string(models.GameCancelled), opponentPayload["status"])
}

func TestLeaveGameRoomAlreadyClosedDoesNotPublishRealtimeUpdate(t *testing.T) {
	creatorID := uint(4)
	roomID := uint(88)

	repo := noopServerGameRepo()
	repo.getRoomFn = func(_ uint) (*models.GameRoom, error) {
		return &models.GameRoom{
			ID:        roomID,
			Type:      models.Othello,
			Status:    models.GameFinished,
			CreatorID: &creatorID,
		}, nil
	}

	hub := notifications.NewHub()
	defer func() {
		_ = hub.Shutdown(context.Background())
	}()

	creatorClient, err := hub.Register(creatorID, nil)
	require.NoError(t, err)

	s := &Server{
		gameService: service.NewGameService(repo),
		hub:         hub,
	}

	app := fiber.New()
	app.Post("/games/rooms/:id/leave", func(c *fiber.Ctx) error {
		c.Locals("userID", creatorID)
		return s.LeaveGameRoom(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/games/rooms/88/leave", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	assertNoAction(t, creatorClient)
}
