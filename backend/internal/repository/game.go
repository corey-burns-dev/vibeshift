package repository

import (
	"errors"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

// GameRepository defines operations for managing game rooms and statistics.
type GameRepository interface {
	CreateRoom(room *models.GameRoom) error
	GetRoom(id uint) (*models.GameRoom, error)
	UpdateRoom(room *models.GameRoom) error
	GetAllActiveRooms() ([]models.GameRoom, error)
	GetActiveRooms(gameType models.GameType) ([]models.GameRoom, error)
	GetPendingRoomByCreator(gameType models.GameType, creatorID uint) (*models.GameRoom, error)
	CreateMove(move *models.GameMove) error
	GetMoves(roomID uint) ([]models.GameMove, error)
	GetStats(userID uint, gameType models.GameType) (*models.GameStats, error)
	UpdateStats(stats *models.GameStats) error
}

type gameRepository struct {
	db *gorm.DB
}

// NewGameRepository creates and returns a new GameRepository instance.
func NewGameRepository(db *gorm.DB) GameRepository {
	return &gameRepository{db: db}
}

func (r *gameRepository) CreateRoom(room *models.GameRoom) error {
	return r.db.Create(room).Error
}

func (r *gameRepository) GetRoom(id uint) (*models.GameRoom, error) {
	var room models.GameRoom
	err := r.db.Preload("Creator").Preload("Opponent").First(&room, id).Error
	return &room, err
}

func (r *gameRepository) UpdateRoom(room *models.GameRoom) error {
	return r.db.Save(room).Error
}

func (r *gameRepository) GetAllActiveRooms() ([]models.GameRoom, error) {
	var rooms []models.GameRoom
	err := r.db.Where("status = ?", models.GamePending).
		Preload("Creator").Find(&rooms).Error
	return rooms, err
}

func (r *gameRepository) GetActiveRooms(gameType models.GameType) ([]models.GameRoom, error) {
	var rooms []models.GameRoom
	err := r.db.Where("type = ? AND status = ?", gameType, models.GamePending).
		Preload("Creator").Find(&rooms).Error
	return rooms, err
}

func (r *gameRepository) GetPendingRoomByCreator(gameType models.GameType, creatorID uint) (*models.GameRoom, error) {
	var room models.GameRoom
	err := r.db.Where("type = ? AND creator_id = ? AND status = ?", gameType, creatorID, models.GamePending).
		Preload("Creator").First(&room).Error
	return &room, err
}

func (r *gameRepository) CreateMove(move *models.GameMove) error {
	return r.db.Create(move).Error
}

func (r *gameRepository) GetMoves(roomID uint) ([]models.GameMove, error) {
	var moves []models.GameMove
	err := r.db.Where("game_room_id = ?", roomID).Order("move_number asc").Find(&moves).Error
	return moves, err
}

func (r *gameRepository) GetStats(userID uint, gameType models.GameType) (*models.GameStats, error) {
	var stats models.GameStats
	err := r.db.Where("user_id = ? AND game_type = ?", userID, gameType).First(&stats).Error
	if err != nil && errors.Is(err, gorm.ErrRecordNotFound) {
		stats = models.GameStats{UserID: userID, GameType: gameType}
		err = r.db.Create(&stats).Error
	}
	return &stats, err
}

func (r *gameRepository) UpdateStats(stats *models.GameStats) error {
	return r.db.Save(stats).Error
}
