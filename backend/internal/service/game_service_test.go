package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

type gameRepoStub struct {
	createRoomFn              func(*models.GameRoom) error
	getRoomFn                 func(uint) (*models.GameRoom, error)
	updateRoomFn              func(*models.GameRoom) error
	getAllActiveRoomsFn       func() ([]models.GameRoom, error)
	getActiveRoomsFn          func(models.GameType) ([]models.GameRoom, error)
	getPendingRoomByCreatorFn func(models.GameType, uint) (*models.GameRoom, error)
	createMoveFn              func(*models.GameMove) error
	getMovesFn                func(uint) ([]models.GameMove, error)
	getStatsFn                func(uint, models.GameType) (*models.GameStats, error)
	updateStatsFn             func(*models.GameStats) error
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
	return s.getPendingRoomByCreatorFn(gameType, creatorID)
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

func noopGameRepo() *gameRepoStub {
	return &gameRepoStub{
		createRoomFn:              func(*models.GameRoom) error { return nil },
		getRoomFn:                 func(uint) (*models.GameRoom, error) { return &models.GameRoom{}, nil },
		updateRoomFn:              func(*models.GameRoom) error { return nil },
		getAllActiveRoomsFn:       func() ([]models.GameRoom, error) { return nil, nil },
		getActiveRoomsFn:          func(models.GameType) ([]models.GameRoom, error) { return nil, nil },
		getPendingRoomByCreatorFn: func(models.GameType, uint) (*models.GameRoom, error) { return nil, nil },
		createMoveFn:              func(*models.GameMove) error { return nil },
		getMovesFn:                func(uint) ([]models.GameMove, error) { return nil, nil },
		getStatsFn:                func(uint, models.GameType) (*models.GameStats, error) { return &models.GameStats{}, nil },
		updateStatsFn:             func(*models.GameStats) error { return nil },
	}
}

func TestGameServiceCreateGameRoomReturnsExistingPending(t *testing.T) {
	repo := noopGameRepo()
	repo.getActiveRoomsFn = func(models.GameType) ([]models.GameRoom, error) {
		return []models.GameRoom{
			{
				ID:        17,
				CreatorID: 9,
				Status:    models.GamePending,
				UpdatedAt: time.Now(),
			},
		}, nil
	}

	svc := NewGameService(repo)
	room, created, err := svc.CreateGameRoom(context.Background(), 9, models.TicTacToe)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if created {
		t.Fatal("expected existing room, got created=true")
	}
	if room.ID != 17 {
		t.Fatalf("expected room 17, got %d", room.ID)
	}
}

func TestGameServiceGetGameRoomNotFound(t *testing.T) {
	repo := noopGameRepo()
	repo.getRoomFn = func(uint) (*models.GameRoom, error) {
		return nil, gorm.ErrRecordNotFound
	}

	svc := NewGameService(repo)
	_, err := svc.GetGameRoom(context.Background(), 55)
	if err == nil {
		t.Fatal("expected not-found error")
	}
	appErr, ok := err.(*models.AppError)
	if !ok || appErr.Code != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND app error, got %#v", err)
	}
}

func TestGameServiceLeaveGameRoomForbidden(t *testing.T) {
	opponent := uint(88)
	repo := noopGameRepo()
	repo.getRoomFn = func(uint) (*models.GameRoom, error) {
		return &models.GameRoom{
			ID:         44,
			CreatorID:  77,
			OpponentID: &opponent,
			Status:     models.GameActive,
		}, nil
	}

	svc := NewGameService(repo)
	_, _, err := svc.LeaveGameRoom(context.Background(), 99, 44)
	if err == nil {
		t.Fatal("expected forbidden error")
	}
	appErr, ok := err.(*models.AppError)
	if !ok || appErr.Code != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN app error, got %#v", err)
	}
}

func TestGameServiceLeaveGameRoomAlreadyClosed(t *testing.T) {
	repo := noopGameRepo()
	repo.getRoomFn = func(uint) (*models.GameRoom, error) {
		return &models.GameRoom{
			ID:        33,
			CreatorID: 5,
			Status:    models.GameFinished,
		}, nil
	}

	svc := NewGameService(repo)
	room, alreadyClosed, err := svc.LeaveGameRoom(context.Background(), 5, 33)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !alreadyClosed {
		t.Fatal("expected alreadyClosed=true")
	}
	if room.Status != models.GameFinished {
		t.Fatalf("expected finished status, got %s", room.Status)
	}
}

func TestGameServiceGetActiveGameRoomsWrapsInternalError(t *testing.T) {
	repo := noopGameRepo()
	repo.getAllActiveRoomsFn = func() ([]models.GameRoom, error) {
		return nil, errors.New("db down")
	}

	svc := NewGameService(repo)
	_, err := svc.GetActiveGameRooms(context.Background(), nil)
	if err == nil {
		t.Fatal("expected internal error")
	}
	appErr, ok := err.(*models.AppError)
	if !ok || appErr.Code != "INTERNAL_ERROR" {
		t.Fatalf("expected INTERNAL_ERROR app error, got %#v", err)
	}
}
