package notifications

import (
	"encoding/json"
	"testing"

	"sanctum/internal/models"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type wireConnectFourStatePayload struct {
	Board    [6][7]string `json:"board"`
	Status   string       `json:"status"`
	WinnerID *uint        `json:"winner_id"`
	NextTurn uint         `json:"next_turn"`
	IsDraw   bool         `json:"is_draw"`
}

func createConnectFourRoom(t *testing.T, db *gorm.DB, creatorID, opponentID uint, board [6][7]string) models.GameRoom {
	t.Helper()

	rawState, err := json.Marshal(board)
	require.NoError(t, err)

	room := models.GameRoom{
		Type:         models.ConnectFour,
		Status:       models.GameActive,
		CreatorID:    &creatorID,
		OpponentID:   &opponentID,
		NextTurnID:   creatorID,
		CurrentState: string(rawState),
	}
	require.NoError(t, db.Create(&room).Error)
	return room
}

func TestGameHubHandleMove_ConnectFourValidMoveBroadcastsState(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [6][7]string
	room := createConnectFourRoom(t, db, creator.ID, opponent.ID, board)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:   "make_move",
		RoomID: room.ID,
		Payload: map[string]int{
			"column": 0,
		},
	})

	creatorAction := mustReadGameAction(t, creatorClient)
	opponentAction := mustReadGameAction(t, opponentClient)
	require.Equal(t, "game_state", creatorAction.Type)
	require.Equal(t, "game_state", opponentAction.Type)

	var payload wireConnectFourStatePayload
	require.NoError(t, json.Unmarshal(creatorAction.Payload, &payload))
	require.Equal(t, "active", payload.Status)
	require.Equal(t, opponent.ID, payload.NextTurn)
	require.Equal(t, "X", payload.Board[5][0])
	require.False(t, payload.IsDraw)

	var updated models.GameRoom
	require.NoError(t, db.First(&updated, room.ID).Error)
	require.Equal(t, models.GameActive, updated.Status)
	require.Equal(t, opponent.ID, updated.NextTurnID)
}

func TestGameHubHandleMove_ConnectFourInvalidMoveReturnsErrorToMoverOnly(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [6][7]string
	for row := 0; row < 6; row++ {
		board[row][0] = "X"
	}

	room := createConnectFourRoom(t, db, creator.ID, opponent.ID, board)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:   "make_move",
		RoomID: room.ID,
		Payload: map[string]int{
			"column": 0,
		},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var payload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))
	require.Equal(t, "Invalid move location or column full", payload.Message)

	expectNoMessage(t, opponentClient)

	var updated models.GameRoom
	require.NoError(t, db.First(&updated, room.ID).Error)
	require.Equal(t, creator.ID, updated.NextTurnID)
}

func TestGameHubHandleMove_ConnectFourNotYourTurnReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [6][7]string
	room := createConnectFourRoom(t, db, creator.ID, opponent.ID, board)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(opponent.ID, GameAction{
		Type:   "make_move",
		RoomID: room.ID,
		Payload: map[string]int{
			"column": 1,
		},
	})

	action := mustReadGameAction(t, opponentClient)
	require.Equal(t, "error", action.Type)
	var payload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))
	require.Equal(t, "Not your turn", payload.Message)

	expectNoMessage(t, creatorClient)
}

func TestGameHubHandleMove_ConnectFourFinishesAndAwardsWinner(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [6][7]string
	board[5][0] = "X"
	board[5][1] = "X"
	board[5][2] = "X"
	board[5][4] = "O"
	board[5][5] = "O"

	room := createConnectFourRoom(t, db, creator.ID, opponent.ID, board)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:   "make_move",
		RoomID: room.ID,
		Payload: map[string]int{
			"column": 3,
		},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "game_state", action.Type)

	var payload wireConnectFourStatePayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))
	require.Equal(t, "finished", payload.Status)
	require.NotNil(t, payload.WinnerID)
	require.Equal(t, creator.ID, *payload.WinnerID)
	require.Equal(t, "X", payload.Board[5][3])
	require.False(t, payload.IsDraw)

	var updated models.GameRoom
	require.NoError(t, db.First(&updated, room.ID).Error)
	require.Equal(t, models.GameFinished, updated.Status)
	require.NotNil(t, updated.WinnerID)
	require.Equal(t, creator.ID, *updated.WinnerID)

	var creatorStats models.GameStats
	require.NoError(t, db.Where("user_id = ? AND game_type = ?", creator.ID, models.ConnectFour).First(&creatorStats).Error)
	require.Equal(t, 1, creatorStats.Wins)
	require.Equal(t, 1, creatorStats.TotalGames)
	require.Equal(t, 15, creatorStats.Points)
}
