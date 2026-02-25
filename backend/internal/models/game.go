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
	// Battleship game type constant
	Battleship GameType = "battleship"
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
	case Battleship:
		return r.CheckBattleshipWin()
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

// MaxGameRoomMessages is the number of recent chat messages retained per room.
const MaxGameRoomMessages = 100

// GameRoomMessage represents a chat message in a game room.
type GameRoomMessage struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	GameRoomID uint      `gorm:"index;not null" json:"game_room_id"`
	UserID     uint      `gorm:"not null" json:"user_id"`
	Username   string    `gorm:"not null" json:"username"`
	Text       string    `gorm:"not null" json:"text"`
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

// BattleshipShip represents a single ship placement on a player's grid.
type BattleshipShip struct {
	Name       string `json:"name"`
	Size       int    `json:"size"`
	Row        int    `json:"row"`
	Col        int    `json:"col"`
	Horizontal bool   `json:"horizontal"`
}

// BattleshipPlaceShipsMove is the payload for the place_ships action.
type BattleshipPlaceShipsMove struct {
	Ships []BattleshipShip `json:"ships"`
}

// BattleshipShotMove is the payload for a make_move action during battle phase.
type BattleshipShotMove struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

// BattleshipState is the full persistent state for a Battleship game room.
type BattleshipState struct {
	Phase         string           `json:"phase"` // "setup" | "battle"
	CreatorReady  bool             `json:"creator_ready"`
	OpponentReady bool             `json:"opponent_ready"`
	CreatorShips  []BattleshipShip `json:"creator_ships"`
	OpponentShips []BattleshipShip `json:"opponent_ships"`
	CreatorShots  [][2]int         `json:"creator_shots"`  // shots fired BY the creator
	OpponentShots [][2]int         `json:"opponent_shots"` // shots fired BY the opponent
}

// InitialBattleshipState returns a zeroed-out setup-phase state.
func InitialBattleshipState() BattleshipState {
	return BattleshipState{
		Phase:         "setup",
		CreatorShips:  []BattleshipShip{},
		OpponentShips: []BattleshipShip{},
		CreatorShots:  [][2]int{},
		OpponentShots: [][2]int{},
	}
}

// GetBattleshipState deserializes CurrentState into a BattleshipState.
func (r *GameRoom) GetBattleshipState() BattleshipState {
	if r.CurrentState == "" || r.CurrentState == "{}" {
		return InitialBattleshipState()
	}
	var state BattleshipState
	if err := json.Unmarshal([]byte(r.CurrentState), &state); err != nil {
		return InitialBattleshipState()
	}
	return state
}

// CheckBattleshipWin returns ("X", true) when creator wins, ("O", true) when
// opponent wins, or ("", false) when the game is ongoing.
// "X" = creator, "O" = opponent — matching the existing winnerSym convention.
func (r *GameRoom) CheckBattleshipWin() (string, bool) {
	state := r.GetBattleshipState()
	if state.Phase != "battle" {
		return "", false
	}
	if allBattleshipShipsSunk(state.OpponentShips, state.CreatorShots) {
		return "X", true
	}
	if allBattleshipShipsSunk(state.CreatorShips, state.OpponentShots) {
		return "O", true
	}
	return "", false
}

// allBattleshipShipsSunk returns true when every cell of every ship has been hit.
func allBattleshipShipsSunk(ships []BattleshipShip, shots [][2]int) bool {
	if len(ships) == 0 {
		return false
	}
	hitSet := make(map[[2]int]bool, len(shots))
	for _, s := range shots {
		hitSet[s] = true
	}
	for _, ship := range ships {
		for i := 0; i < ship.Size; i++ {
			var cell [2]int
			if ship.Horizontal {
				cell = [2]int{ship.Row, ship.Col + i}
			} else {
				cell = [2]int{ship.Row + i, ship.Col}
			}
			if !hitSet[cell] {
				return false
			}
		}
	}
	return true
}
