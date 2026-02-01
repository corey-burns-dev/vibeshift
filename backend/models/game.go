package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// GameType defines the type of game
type GameType string

const (
	TicTacToe   GameType = "tictactoe"
	ConnectFour GameType = "connect4"
)

// GameStatus defines the current state of a game
type GameStatus string

const (
	GamePending   GameStatus = "pending"   // Waiting for players to join
	GameActive    GameStatus = "active"    // Game in progress
	GameFinished  GameStatus = "finished"  // Game ended
	GameCancelled GameStatus = "cancelled" // Game stopped before finishing
)

// GameRoom represents a specific instance of a game
type GameRoom struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	Type          GameType       `gorm:"not null" json:"type"`
	Status        GameStatus     `gorm:"default:'pending'" json:"status"`
	CreatorID     uint           `gorm:"not null" json:"creator_id"`
	OpponentID    *uint          `json:"opponent_id,omitempty"`
	WinnerID      *uint          `json:"winner_id,omitempty"`
	IsDraw        bool           `gorm:"default:false" json:"is_draw"`
	Configuration string         `gorm:"type:json" json:"configuration,omitempty"` // e.g., board size, game-specific rules
	CurrentState  string         `gorm:"type:json" json:"current_state"`           // Current board state
	NextTurnID    uint           `json:"next_turn_id"`                             // ID of user whose turn it is

	Creator  User `gorm:"foreignKey:CreatorID" json:"creator,omitempty"`
	Opponent User `gorm:"foreignKey:OpponentID" json:"opponent,omitempty"`
	Winner   User `gorm:"foreignKey:WinnerID" json:"winner,omitempty"`
}

// SetState sets the board state (abstracted as JSON)
func (r *GameRoom) SetState(board interface{}) {
	bytes, _ := json.Marshal(board)
	r.CurrentState = string(bytes)
}

// GetTicTacToeState returns the board state as a 3x3 array
func (r *GameRoom) GetTicTacToeState() [3][3]string {
	var board [3][3]string
	if r.CurrentState == "" || r.CurrentState == "{}" {
		return board
	}
	json.Unmarshal([]byte(r.CurrentState), &board)
	return board
}

// GetConnectFourState returns the board state as a 6x7 array (rows x cols)
func (r *GameRoom) GetConnectFourState() [6][7]string {
	var board [6][7]string
	if r.CurrentState == "" || r.CurrentState == "{}" {
		return board
	}
	json.Unmarshal([]byte(r.CurrentState), &board)
	return board
}

// CheckWin checks if there is a winner based on game type
func (r *GameRoom) CheckWin() (string, bool) {
	switch r.Type {
	case TicTacToe:
		return r.CheckTicTacToeWin()
	case ConnectFour:
		return r.CheckConnectFourWin()
	}
	return "", false
}

// CheckTicTacToeWin checks for a winner in Tic-Tac-Toe
func (r *GameRoom) CheckTicTacToeWin() (string, bool) {
	board := r.GetTicTacToeState()

	// Rows
	for i := 0; i < 3; i++ {
		if board[i][0] != "" && board[i][0] == board[i][1] && board[i][1] == board[i][2] {
			return board[i][0], true
		}
	}

	// Columns
	for i := 0; i < 3; i++ {
		if board[0][i] != "" && board[0][i] == board[1][i] && board[1][i] == board[2][i] {
			return board[0][i], true
		}
	}

	// Diagonals
	if board[0][0] != "" && board[0][0] == board[1][1] && board[1][1] == board[2][2] {
		return board[0][0], true
	}
	if board[0][2] != "" && board[0][2] == board[1][1] && board[1][1] == board[2][0] {
		return board[0][2], true
	}

	// Check Draw
	isDraw := true
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			if board[i][j] == "" {
				isDraw = false
				break
			}
		}
	}

	if isDraw {
		return "", true
	}

	return "", false
}

// CheckConnectFourWin checks for a winner in Connect Four
func (r *GameRoom) CheckConnectFourWin() (string, bool) {
	board := r.GetConnectFourState()
	rows := 6
	cols := 7

	// Check Horizontal
	for r := 0; r < rows; r++ {
		for c := 0; c <= cols-4; c++ {
			if board[r][c] != "" &&
				board[r][c] == board[r][c+1] &&
				board[r][c+1] == board[r][c+2] &&
				board[r][c+2] == board[r][c+3] {
				return board[r][c], true
			}
		}
	}

	// Check Vertical
	for r := 0; r <= rows-4; r++ {
		for c := 0; c < cols; c++ {
			if board[r][c] != "" &&
				board[r][c] == board[r+1][c] &&
				board[r+1][c] == board[r+2][c] &&
				board[r+2][c] == board[r+3][c] {
				return board[r][c], true
			}
		}
	}

	// Check Diagonal (down-right)
	for r := 0; r <= rows-4; r++ {
		for c := 0; c <= cols-4; c++ {
			if board[r][c] != "" &&
				board[r][c] == board[r+1][c+1] &&
				board[r+1][c+1] == board[r+2][c+2] &&
				board[r+2][c+2] == board[r+3][c+3] {
				return board[r][c], true
			}
		}
	}

	// Check Diagonal (up-right)
	for r := 3; r < rows; r++ {
		for c := 0; c <= cols-4; c++ {
			if board[r][c] != "" &&
				board[r][c] == board[r-1][c+1] &&
				board[r-1][c+1] == board[r-2][c+2] &&
				board[r-2][c+2] == board[r-3][c+3] {
				return board[r][c], true
			}
		}
	}

	// Check Draw
	isDraw := true
	for c := 0; c < cols; c++ {
		if board[0][c] == "" { // Top row has space
			isDraw = false
			break
		}
	}

	if isDraw {
		return "", true
	}

	return "", false
}

// GameMove represents a single move made in a game
type GameMove struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	GameRoomID uint      `gorm:"index" json:"game_room_id"`
	UserID     uint      `json:"user_id"`
	MoveData   string    `gorm:"type:json" json:"move_data"` // JSON representation of the move (e.g., coordinates)
	MoveNumber int       `json:"move_number"`
	CreatedAt  time.Time `json:"created_at"`
}

// GameStats tracks overall performance for a user
type GameStats struct {
	ID         uint     `gorm:"primaryKey" json:"id"`
	UserID     uint     `gorm:"uniqueIndex:idx_user_game" json:"user_id"`
	GameType   GameType `gorm:"uniqueIndex:idx_user_game" json:"game_type"`
	Wins       int      `gorm:"default:0" json:"wins"`
	Losses     int      `gorm:"default:0" json:"losses"`
	Draws      int      `gorm:"default:0" json:"draws"`
	TotalGames int      `gorm:"default:0" json:"total_games"`
	Points     int      `gorm:"default:0" json:"points"`
}

// MoveDetails for Tic-Tac-Toe
type TicTacToeMove struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// MoveDetails for Connect Four
type ConnectFourMove struct {
	Column int `json:"column"`
}
