package service

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/observability"
	"sanctum/internal/repository"

	"gorm.io/gorm"
)

const pendingRoomMaxIdle = 10 * time.Minute

func isPendingRoomStale(room models.GameRoom, now time.Time) bool {
	if room.Status != models.GamePending {
		return false
	}
	return now.Sub(room.UpdatedAt) > pendingRoomMaxIdle
}

// GameService provides game-room business logic.
type GameService struct {
	gameRepo repository.GameRepository
}

// NewGameService returns a new GameService.
func NewGameService(gameRepo repository.GameRepository) *GameService {
	return &GameService{gameRepo: gameRepo}
}

// CreateGameRoom creates or reuses a pending game room for the user.
func (s *GameService) CreateGameRoom(_ context.Context, userID uint, gameType models.GameType) (*models.GameRoom, bool, error) {
	existingRooms, err := s.gameRepo.GetActiveRooms(gameType)
	if err != nil {
		return nil, false, models.NewInternalError(err)
	}

	now := time.Now()
	for _, room := range existingRooms {
		if room.CreatorID != nil && *room.CreatorID == userID {
			if isPendingRoomStale(room, now) {
				room.Status = models.GameCancelled
				room.OpponentID = nil
				room.WinnerID = nil
				room.NextTurnID = 0
				if updateErr := s.gameRepo.UpdateRoom(&room); updateErr != nil {
					observability.GlobalLogger.ErrorContext(context.Background(), "failed to auto-cancel stale room",
						slog.Uint64("room_id", uint64(room.ID)),
						slog.String("error", updateErr.Error()),
					)
				}
				continue
			}

			return &room, false, nil
		}
	}

	room := &models.GameRoom{
		Type:          gameType,
		Status:        models.GamePending,
		CreatorID:     &userID,
		CurrentState:  "{}",
		Configuration: "{}",
	}
	if gameType == models.Othello {
		initialBoard := models.InitialOthelloBoard()
		if bytes, marshalErr := json.Marshal(initialBoard); marshalErr == nil {
			room.CurrentState = string(bytes)
		}
	}
	if err := s.gameRepo.CreateRoom(room); err != nil {
		return nil, false, models.NewInternalError(err)
	}

	return room, true, nil
}

// GetActiveGameRooms returns active game rooms, optionally filtered by type.
func (s *GameService) GetActiveGameRooms(_ context.Context, gameType *models.GameType) ([]models.GameRoom, error) {
	var (
		rooms []models.GameRoom
		err   error
	)

	if gameType == nil {
		rooms, err = s.gameRepo.GetAllActiveRooms()
	} else {
		rooms, err = s.gameRepo.GetActiveRooms(*gameType)
	}
	if err != nil {
		return nil, models.NewInternalError(err)
	}

	now := time.Now()
	filtered := make([]models.GameRoom, 0, len(rooms))
	for _, room := range rooms {
		if isPendingRoomStale(room, now) {
			room.Status = models.GameCancelled
			room.OpponentID = nil
			room.WinnerID = nil
			room.NextTurnID = 0
			if updateErr := s.gameRepo.UpdateRoom(&room); updateErr != nil {
				observability.GlobalLogger.ErrorContext(context.Background(), "failed to auto-cancel stale room",
					slog.Uint64("room_id", uint64(room.ID)),
					slog.String("error", updateErr.Error()),
				)
			}
			continue
		}
		filtered = append(filtered, room)
	}

	return filtered, nil
}

// GetGameStats returns game statistics for the user and game type.
func (s *GameService) GetGameStats(_ context.Context, userID uint, gameType models.GameType) (*models.GameStats, error) {
	stats, err := s.gameRepo.GetStats(userID, gameType)
	if err != nil {
		return nil, models.NewInternalError(err)
	}
	return stats, nil
}

// GetGameRoom returns a game room by ID.
func (s *GameService) GetGameRoom(_ context.Context, roomID uint) (*models.GameRoom, error) {
	room, err := s.gameRepo.GetRoom(roomID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.NewNotFoundError("GameRoom", roomID)
		}
		return nil, models.NewInternalError(err)
	}
	return room, nil
}

// LeaveGameRoom removes the user from the game room and updates state.
func (s *GameService) LeaveGameRoom(_ context.Context, userID, roomID uint) (*models.GameRoom, bool, error) {
	room, err := s.gameRepo.GetRoom(roomID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, models.NewNotFoundError("GameRoom", roomID)
		}
		return nil, false, models.NewInternalError(err)
	}

	isCreator := room.CreatorID != nil && *room.CreatorID == userID
	isOpponent := room.OpponentID != nil && *room.OpponentID == userID
	if !isCreator && !isOpponent {
		return nil, false, models.NewForbiddenError("Not a participant in this room")
	}

	if room.Status == models.GameFinished || room.Status == models.GameCancelled {
		return room, true, nil
	}

	room.Status = models.GameCancelled
	room.OpponentID = nil
	room.WinnerID = nil
	room.NextTurnID = 0

	if err := s.gameRepo.UpdateRoom(room); err != nil {
		return nil, false, models.NewInternalError(err)
	}

	return room, false, nil
}
