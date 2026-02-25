package notifications

import (
	"encoding/json"
	"testing"

	"sanctum/internal/models"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// wireCheckersStatePayload is the shape of the payload in a Checkers game_state action.
type wireCheckersStatePayload struct {
	Board    json.RawMessage `json:"board"`
	Status   string          `json:"status"`
	WinnerID *uint           `json:"winner_id"`
	NextTurn uint            `json:"next_turn"`
	IsDraw   bool            `json:"is_draw"`
}

// wireCheckersBoard is the board field inside wireCheckersStatePayload.
type wireCheckersBoard struct {
	Board        [8][8]string `json:"board"`
	MustJumpFrom *[2]int      `json:"must_jump_from"`
}

func createCheckersRoom(t *testing.T, db *gorm.DB, creatorID, opponentID uint, state models.CheckersState) models.GameRoom {
	t.Helper()
	rawState, err := json.Marshal(state)
	require.NoError(t, err)
	room := models.GameRoom{
		Type:         models.Checkers,
		Status:       models.GameActive,
		CreatorID:    &creatorID,
		OpponentID:   &opponentID,
		NextTurnID:   creatorID,
		CurrentState: string(rawState),
	}
	require.NoError(t, db.Create(&room).Error)
	return room
}

// --- handleMove (Checkers) integration tests ---

func TestHandleMove_Checkers_ValidSimpleMove_BroadcastsState(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	// Simple board: creator "r" at (5,0) can move to (4,1)
	var board [8][8]string
	board[5][0] = "r"
	board[2][1] = "b"
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{5, 0}, "to": [2]int{4, 1}},
	})

	creatorAction := mustReadGameAction(t, creatorClient)
	opponentAction := mustReadGameAction(t, opponentClient)
	require.Equal(t, "game_state", creatorAction.Type)
	require.Equal(t, "game_state", opponentAction.Type)

	var payload wireCheckersStatePayload
	require.NoError(t, json.Unmarshal(creatorAction.Payload, &payload))
	require.Equal(t, "active", payload.Status)
	require.Equal(t, opponent.ID, payload.NextTurn)

	var board2 wireCheckersBoard
	require.NoError(t, json.Unmarshal(payload.Board, &board2))
	require.Equal(t, "", board2.Board[5][0])
	require.Equal(t, "r", board2.Board[4][1])
	require.Nil(t, board2.MustJumpFrom)
}

func TestHandleMove_Checkers_ValidJump_RemovesCapturedPiece(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [8][8]string
	board[4][3] = "r"
	board[3][2] = "b" // r can jump b to (2,1)
	board[0][1] = "b" // extra opponent piece so game isn't won
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{4, 3}, "to": [2]int{2, 1}},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "game_state", action.Type)

	var payload wireCheckersStatePayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))

	var board2 wireCheckersBoard
	require.NoError(t, json.Unmarshal(payload.Board, &board2))
	require.Equal(t, "r", board2.Board[2][1]) // piece landed
	require.Equal(t, "", board2.Board[4][3])  // from cleared
	require.Equal(t, "", board2.Board[3][2])  // captured piece removed
}

func TestHandleMove_Checkers_MultiJump_SamePlayerContinues(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	// Setup: r at (6,1), b at (5,2) and b at (3,4) → double jump
	var board [8][8]string
	board[6][1] = "r"
	board[5][2] = "b"
	board[3][4] = "b"
	board[0][1] = "b" // extra piece so game continues
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	// First jump: (6,1) → (4,3)
	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{6, 1}, "to": [2]int{4, 3}},
	})

	action := mustReadGameAction(t, creatorClient)
	mustReadGameAction(t, opponentClient) // drain opponent
	require.Equal(t, "game_state", action.Type)

	var payload wireCheckersStatePayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))
	require.Equal(t, creator.ID, payload.NextTurn) // same player continues

	var board2 wireCheckersBoard
	require.NoError(t, json.Unmarshal(payload.Board, &board2))
	require.NotNil(t, board2.MustJumpFrom)
	require.Equal(t, [2]int{4, 3}, *board2.MustJumpFrom)

	// Second jump: (4,3) → (2,5) — must be from the same piece
	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{4, 3}, "to": [2]int{2, 5}},
	})

	action2 := mustReadGameAction(t, creatorClient)
	require.Equal(t, "game_state", action2.Type)

	var payload2 wireCheckersStatePayload
	require.NoError(t, json.Unmarshal(action2.Payload, &payload2))
	require.Equal(t, opponent.ID, payload2.NextTurn) // now opponent's turn

	var board3 wireCheckersBoard
	require.NoError(t, json.Unmarshal(payload2.Board, &board3))
	require.Nil(t, board3.MustJumpFrom)
	require.Equal(t, "", board3.Board[3][4]) // second captured piece removed
}

func TestHandleMove_Checkers_Kinging(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [8][8]string
	board[1][0] = "r" // one move from kinging at row 0
	board[6][1] = "b"
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{1, 0}, "to": [2]int{0, 1}},
	})

	action := mustReadGameAction(t, creatorClient)
	var payload wireCheckersStatePayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))

	var board2 wireCheckersBoard
	require.NoError(t, json.Unmarshal(payload.Board, &board2))
	require.Equal(t, "R", board2.Board[0][1]) // kinged!
}

func TestHandleMove_Checkers_KingingEndsMultiJump(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	// r at (2,1), b at (1,2). Jump to (0,3) → kinged. Even if more jumps
	// would be possible as king, turn switches per American checkers rules.
	var board [8][8]string
	board[2][1] = "r"
	board[1][2] = "b"
	board[6][1] = "b" // extra piece
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{2, 1}, "to": [2]int{0, 3}},
	})

	action := mustReadGameAction(t, creatorClient)
	var payload wireCheckersStatePayload
	require.NoError(t, json.Unmarshal(action.Payload, &payload))
	require.Equal(t, opponent.ID, payload.NextTurn) // turn switched despite being a jump

	var board2 wireCheckersBoard
	require.NoError(t, json.Unmarshal(payload.Board, &board2))
	require.Equal(t, "R", board2.Board[0][3])
	require.Nil(t, board2.MustJumpFrom)
}

func TestHandleMove_Checkers_MandatoryCapture_RejectsSimpleMove(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	// r at (4,3) has a jump over b at (3,2). Trying simple move to (3,4) should fail.
	var board [8][8]string
	board[4][3] = "r"
	board[3][2] = "b"
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{4, 3}, "to": [2]int{3, 4}},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Contains(t, errPayload.Message, "Must capture")

	expectNoMessage(t, opponentClient)
}

func TestHandleMove_Checkers_MustContinueFromSamePiece(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	// Setup multi-jump: after first jump, must_jump_from is set
	jumpFrom := [2]int{4, 3}
	var board [8][8]string
	board[4][3] = "r"
	board[3][4] = "b"
	board[6][5] = "r" // another creator piece
	board[0][1] = "b" // extra opponent
	state := models.CheckersState{Board: board, MustJumpFrom: &jumpFrom}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	// Try to move a different piece
	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{6, 5}, "to": [2]int{5, 4}},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Contains(t, errPayload.Message, "Must continue jump")

	expectNoMessage(t, opponentClient)
}

func TestHandleMove_Checkers_NotYourTurn_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	state := models.CheckersState{Board: models.InitialCheckersBoard()}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	_, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	// Opponent tries to move when it's creator's turn
	hub.handleMove(opponent.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{2, 1}, "to": [2]int{3, 0}},
	})

	action := mustReadGameAction(t, opponentClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Equal(t, "Not your turn", errPayload.Message)
}

func TestHandleMove_Checkers_NotYourPiece_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [8][8]string
	board[5][0] = "r"
	board[2][1] = "b"
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	// Creator tries to move opponent's piece
	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{2, 1}, "to": [2]int{3, 0}},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Equal(t, "Not your piece", errPayload.Message)
}

func TestHandleMove_Checkers_InvalidSimpleMove_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	var board [8][8]string
	board[5][0] = "r"
	board[2][1] = "b"
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	// Try backward move with non-king
	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{5, 0}, "to": [2]int{6, 1}},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Equal(t, "Invalid move", errPayload.Message)
}

func TestHandleMove_Checkers_FinishesAndAwards20Points(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	// Creator r at (4,3), last opponent b at (3,2). Jump captures last piece → win.
	var board [8][8]string
	board[4][3] = "r"
	board[3][2] = "b"
	state := models.CheckersState{Board: board}
	room := createCheckersRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"from": [2]int{4, 3}, "to": [2]int{2, 1}},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "game_state", action.Type)

	var payload wireCheckersStatePayload
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
	require.NoError(t, db.Where("user_id = ? AND game_type = ?", creator.ID, models.Checkers).First(&creatorStats).Error)
	require.Equal(t, 1, creatorStats.Wins)
	require.Equal(t, 1, creatorStats.TotalGames)
	require.Equal(t, 20, creatorStats.Points)

	var opponentStats models.GameStats
	require.NoError(t, db.Where("user_id = ? AND game_type = ?", opponent.ID, models.Checkers).First(&opponentStats).Error)
	require.Equal(t, 1, opponentStats.Losses)
	require.Equal(t, 1, opponentStats.TotalGames)
}
