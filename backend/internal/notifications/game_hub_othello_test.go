package notifications

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"sanctum/internal/models"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type wireGameAction struct {
	Type    string          `json:"type"`
	RoomID  uint            `json:"room_id"`
	Payload json.RawMessage `json:"payload"`
}

type wireGameStatePayload struct {
	Board    [8][8]string `json:"board"`
	Status   string       `json:"status"`
	WinnerID *uint        `json:"winner_id"`
	NextTurn uint         `json:"next_turn"`
	IsDraw   bool         `json:"is_draw"`
}

type wireErrorPayload struct {
	Message string `json:"message"`
}

func setupGameSQLiteDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:gamehub_othello_%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)

	require.NoError(t, db.AutoMigrate(
		&models.User{},
		&models.GameRoom{},
		&models.GameMove{},
		&models.GameStats{},
		&models.GameRoomMessage{},
	))

	return db
}

func createGameUsers(t *testing.T, db *gorm.DB) (models.User, models.User) {
	t.Helper()

	creator := models.User{
		Username: "creator",
		Email:    "creator@example.com",
		Password: "hashed",
	}
	opponent := models.User{
		Username: "opponent",
		Email:    "opponent@example.com",
		Password: "hashed",
	}
	require.NoError(t, db.Create(&creator).Error)
	require.NoError(t, db.Create(&opponent).Error)
	return creator, opponent
}

func createOthelloRoom(t *testing.T, db *gorm.DB, creatorID, opponentID uint, board [8][8]string) models.GameRoom {
	t.Helper()

	rawState, err := json.Marshal(board)
	require.NoError(t, err)

	room := models.GameRoom{
		Type:         models.Othello,
		Status:       models.GameActive,
		CreatorID:    &creatorID,
		OpponentID:   &opponentID,
		NextTurnID:   creatorID,
		CurrentState: string(rawState),
	}
	require.NoError(t, db.Create(&room).Error)
	return room
}

func registerRoomClients(t *testing.T, hub *GameHub, roomID, creatorID, opponentID uint) (*Client, *Client) {
	t.Helper()

	creator := &Client{
		Hub:    hub,
		UserID: creatorID,
		Send:   make(chan []byte, 8),
	}
	opponent := &Client{
		Hub:    hub,
		UserID: opponentID,
		Send:   make(chan []byte, 8),
	}
	require.NoError(t, hub.RegisterClient(roomID, creator))
	require.NoError(t, hub.RegisterClient(roomID, opponent))
	return creator, opponent
}

func mustReadGameAction(t *testing.T, c *Client) wireGameAction {
	t.Helper()

	select {
	case msg := <-c.Send:
		var action wireGameAction
		require.NoError(t, json.Unmarshal(msg, &action))
		return action
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for game action")
		return wireGameAction{}
	}
}

func expectNoMessage(t *testing.T, c *Client) {
	t.Helper()
	select {
	case msg := <-c.Send:
		t.Fatalf("expected no message but received: %s", string(msg))
	case <-time.After(200 * time.Millisecond):
	}
}

func TestGameHubHandleMove_OthelloValidMoveBroadcastsState(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createOthelloRoom(t, db, creator.ID, opponent.ID, models.InitialOthelloBoard())
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:   "make_move",
		RoomID: room.ID,
		Payload: map[string]int{
			"row":    2,
			"column": 3,
		},
	})

	creatorAction := mustReadGameAction(t, creatorClient)
	opponentAction := mustReadGameAction(t, opponentClient)
	require.Equal(t, "game_state", creatorAction.Type)
	require.Equal(t, "game_state", opponentAction.Type)

	var payload wireGameStatePayload
	require.NoError(t, json.Unmarshal(creatorAction.Payload, &payload))
	require.Equal(t, "active", payload.Status)
	require.Equal(t, opponent.ID, payload.NextTurn)
	require.Equal(t, "X", payload.Board[2][3])
	require.Equal(t, "X", payload.Board[3][3])
	require.False(t, payload.IsDraw)

	var updated models.GameRoom
	require.NoError(t, db.First(&updated, room.ID).Error)
	require.Equal(t, models.GameActive, updated.Status)
	require.Equal(t, opponent.ID, updated.NextTurnID)
}

func TestGameHubHandleMove_OthelloInvalidMoveReturnsErrorToMoverOnly(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createOthelloRoom(t, db, creator.ID, opponent.ID, models.InitialOthelloBoard())
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:   "make_move",
		RoomID: room.ID,
		Payload: map[string]int{
			"row":    0,
			"column": 0,
		},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var payload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))
	require.Equal(t, "Invalid move location", payload.Message)

	expectNoMessage(t, opponentClient)

	var updated models.GameRoom
	require.NoError(t, db.First(&updated, room.ID).Error)
	require.Equal(t, creator.ID, updated.NextTurnID)
}

func TestGameHubHandleMove_OthelloPassesTurnBackWhenOpponentHasNoLegalMove(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [8][8]string
	for row := 0; row < 8; row++ {
		for col := 0; col < 8; col++ {
			board[row][col] = "X"
		}
	}
	board[0][1] = "O"
	board[0][2] = ""
	board[7][6] = "O"
	board[7][7] = ""

	room := createOthelloRoom(t, db, creator.ID, opponent.ID, board)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:   "make_move",
		RoomID: room.ID,
		Payload: map[string]int{
			"row":    0,
			"column": 2,
		},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "game_state", action.Type)
	var payload wireGameStatePayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))
	require.Equal(t, "active", payload.Status)
	require.Equal(t, creator.ID, payload.NextTurn)
	require.Equal(t, "X", payload.Board[0][1])
	require.Equal(t, "X", payload.Board[0][2])
}

func TestGameHubHandleMove_OthelloFinishesAndAwardsWinner(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [8][8]string
	for row := 0; row < 8; row++ {
		for col := 0; col < 8; col++ {
			board[row][col] = "X"
		}
	}
	board[0][1] = "O"
	board[0][2] = ""

	room := createOthelloRoom(t, db, creator.ID, opponent.ID, board)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:   "make_move",
		RoomID: room.ID,
		Payload: map[string]int{
			"row":    0,
			"column": 2,
		},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "game_state", action.Type)
	var payload wireGameStatePayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))
	require.Equal(t, "finished", payload.Status)
	require.NotNil(t, payload.WinnerID)
	require.Equal(t, creator.ID, *payload.WinnerID)
	require.False(t, payload.IsDraw)

	var updated models.GameRoom
	require.NoError(t, db.First(&updated, room.ID).Error)
	require.Equal(t, models.GameFinished, updated.Status)
	require.NotNil(t, updated.WinnerID)
	require.Equal(t, creator.ID, *updated.WinnerID)

	var creatorStats models.GameStats
	require.NoError(t, db.Where("user_id = ? AND game_type = ?", creator.ID, models.Othello).First(&creatorStats).Error)
	require.Equal(t, 1, creatorStats.Wins)
	require.Equal(t, 1, creatorStats.TotalGames)
	require.Equal(t, 25, creatorStats.Points)
}
