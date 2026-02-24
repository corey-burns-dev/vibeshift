package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// GameType defines the type of game
type GameType string

const (
	// ConnectFour game type constant
	ConnectFour GameType = "connect4"
	// Othello game type constant
	Othello GameType = "othello"
)

// GameStatus defines the current state of a game
type GameStatus string

const (
	// GamePending indicates game is waiting for players to join
	GamePending GameStatus = "pending"
	// GameActive indicates game is currently being played
	GameActive GameStatus = "active"
	// GameFinished indicates game has ended
	GameFinished GameStatus = "finished"
	// GameCancelled indicates game was aborted
	GameCancelled GameStatus = "cancelled"
)

// GameRoom represents a specific instance of a game
type GameRoom struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	Type          GameType       `gorm:"not null" json:"type"`
	Status        GameStatus     `gorm:"default:'pending'" json:"status"`
	CreatorID     *uint          `json:"creator_id,omitempty"`
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

// GetConnectFourState returns the board state as a 6x7 array (rows x cols)
func (r *GameRoom) GetConnectFourState() [6][7]string {
	var board [6][7]string
	if r.CurrentState == "" || r.CurrentState == "{}" {
		return board
	}
	_ = json.Unmarshal([]byte(r.CurrentState), &board)
	return board
}

// InitialOthelloBoard returns the default 8x8 Othello board.
func InitialOthelloBoard() [8][8]string {
	var board [8][8]string
	board[3][3] = "O"
	board[3][4] = "X"
	board[4][3] = "X"
	board[4][4] = "O"
	return board
}

// GetOthelloState returns the board state as an 8x8 array.
func (r *GameRoom) GetOthelloState() [8][8]string {
	var board [8][8]string
	if r.CurrentState == "" || r.CurrentState == "{}" {
		return InitialOthelloBoard()
	}
	_ = json.Unmarshal([]byte(r.CurrentState), &board)
	return board
}

// CheckWin checks if there is a winner based on game type
func (r *GameRoom) CheckWin() (string, bool) {
	switch r.Type {
	case ConnectFour:
		return r.CheckConnectFourWin()
	case Othello:
		return r.CheckOthelloWin()
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

var othelloDirections = [8][2]int{
	{-1, -1}, {-1, 0}, {-1, 1},
	{0, -1}, {0, 1},
	{1, -1}, {1, 0}, {1, 1},
}

func inOthelloBounds(row, col int) bool {
	return row >= 0 && row < 8 && col >= 0 && col < 8
}

func canOthelloMove(board [8][8]string, row, col int, symbol string) bool {
	if !inOthelloBounds(row, col) || board[row][col] != "" {
		return false
	}

	opponent := "O"
	if symbol == "O" {
		opponent = "X"
	}

	for _, dir := range othelloDirections {
		r := row + dir[0]
		c := col + dir[1]
		seenOpponent := false

		for inOthelloBounds(r, c) && board[r][c] == opponent {
			seenOpponent = true
			r += dir[0]
			c += dir[1]
		}

		if seenOpponent && inOthelloBounds(r, c) && board[r][c] == symbol {
			return true
		}
	}

	return false
}

func hasAnyOthelloMove(board [8][8]string, symbol string) bool {
	for row := 0; row < 8; row++ {
		for col := 0; col < 8; col++ {
			if canOthelloMove(board, row, col, symbol) {
				return true
			}
		}
	}
	return false
}

// CheckOthelloWin checks for a winner in Othello.
func (r *GameRoom) CheckOthelloWin() (string, bool) {
	board := r.GetOthelloState()

	if hasAnyOthelloMove(board, "X") || hasAnyOthelloMove(board, "O") {
		return "", false
	}

	xCount := 0
	oCount := 0
	for row := 0; row < 8; row++ {
		for col := 0; col < 8; col++ {
			switch board[row][col] {
			case "X":
				xCount++
			case "O":
				oCount++
			}
		}
	}

	switch {
	case xCount > oCount:
		return "X", true
	case oCount > xCount:
		return "O", true
	default:
		return "", true
	}
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

// ConnectFourMove represents a move in Connect Four game.
type ConnectFourMove struct {
	Column int `json:"column"`
}

// OthelloMove represents a move in Othello.
type OthelloMove struct {
	Row    int `json:"row"`
	Column int `json:"column"`
}
