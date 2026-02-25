package notifications

import (
	"encoding/json"
	"testing"

	"sanctum/internal/models"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// wireBattleshipStatePayload is the shape of the payload in a Battleship game_state action.
type wireBattleshipStatePayload struct {
	Board    json.RawMessage `json:"board"`
	Status   string          `json:"status"`
	WinnerID *uint           `json:"winner_id"`
	NextTurn uint            `json:"next_turn"`
	IsDraw   bool            `json:"is_draw"`
}

// wireBattleshipBoard is the shape of the board field inside wireBattleshipStatePayload.
type wireBattleshipBoard struct {
	Phase         string   `json:"phase"`
	CreatorReady  bool     `json:"creator_ready"`
	OpponentReady bool     `json:"opponent_ready"`
	CreatorShots  [][2]int `json:"creator_shots"`
	OpponentShots [][2]int `json:"opponent_shots"`
}

func createBattleshipRoom(t *testing.T, db *gorm.DB, creatorID, opponentID uint, state models.BattleshipState) models.GameRoom {
	t.Helper()
	rawState, err := json.Marshal(state)
	require.NoError(t, err)
	room := models.GameRoom{
		Type:         models.Battleship,
		Status:       models.GameActive,
		CreatorID:    &creatorID,
		OpponentID:   &opponentID,
		NextTurnID:   creatorID,
		CurrentState: string(rawState),
	}
	require.NoError(t, db.Create(&room).Error)
	return room
}

// standardFleet returns a valid 5-ship fleet placed in rows 0–4, horizontal, no overlaps.
func standardFleet() []models.BattleshipShip {
	return []models.BattleshipShip{
		{Name: "Carrier", Size: 5, Row: 0, Col: 0, Horizontal: true},
		{Name: "Battleship", Size: 4, Row: 1, Col: 0, Horizontal: true},
		{Name: "Cruiser", Size: 3, Row: 2, Col: 0, Horizontal: true},
		{Name: "Submarine", Size: 3, Row: 3, Col: 0, Horizontal: true},
		{Name: "Destroyer", Size: 2, Row: 4, Col: 0, Horizontal: true},
	}
}

// opponentFleet returns a valid 5-ship fleet placed in rows 5–9, horizontal, no overlaps.
func opponentFleet() []models.BattleshipShip {
	return []models.BattleshipShip{
		{Name: "Carrier", Size: 5, Row: 5, Col: 0, Horizontal: true},
		{Name: "Battleship", Size: 4, Row: 6, Col: 0, Horizontal: true},
		{Name: "Cruiser", Size: 3, Row: 7, Col: 0, Horizontal: true},
		{Name: "Submarine", Size: 3, Row: 8, Col: 0, Horizontal: true},
		{Name: "Destroyer", Size: 2, Row: 9, Col: 0, Horizontal: true},
	}
}

// --- validateBattleshipFleet unit tests ---

func TestValidateBattleshipFleet_Valid(t *testing.T) {
	require.NoError(t, validateBattleshipFleet(standardFleet()))
}

func TestValidateBattleshipFleet_WrongShipCount(t *testing.T) {
	err := validateBattleshipFleet(standardFleet()[:4])
	require.Error(t, err)
	require.Contains(t, err.Error(), "expected 5 ships")
}

func TestValidateBattleshipFleet_DuplicateShip(t *testing.T) {
	fleet := []models.BattleshipShip{
		{Name: "Carrier", Size: 5, Row: 0, Col: 0, Horizontal: true},
		{Name: "Carrier", Size: 5, Row: 1, Col: 0, Horizontal: true},
		{Name: "Battleship", Size: 4, Row: 2, Col: 0, Horizontal: true},
		{Name: "Cruiser", Size: 3, Row: 3, Col: 0, Horizontal: true},
		{Name: "Submarine", Size: 3, Row: 4, Col: 0, Horizontal: true},
	}
	err := validateBattleshipFleet(fleet)
	require.Error(t, err)
	require.Contains(t, err.Error(), "duplicate")
}

func TestValidateBattleshipFleet_WrongSize(t *testing.T) {
	fleet := standardFleet()
	fleet[0].Size = 3 // Carrier must be 5
	err := validateBattleshipFleet(fleet)
	require.Error(t, err)
	require.Contains(t, err.Error(), "wrong size")
}

func TestValidateBattleshipFleet_OutOfBoundsHorizontal(t *testing.T) {
	fleet := standardFleet()
	fleet[0] = models.BattleshipShip{Name: "Carrier", Size: 5, Row: 0, Col: 7, Horizontal: true} // cols 7-11
	err := validateBattleshipFleet(fleet)
	require.Error(t, err)
	require.Contains(t, err.Error(), "out of bounds")
}

func TestValidateBattleshipFleet_OutOfBoundsVertical(t *testing.T) {
	fleet := standardFleet()
	fleet[4] = models.BattleshipShip{Name: "Destroyer", Size: 2, Row: 9, Col: 0, Horizontal: false} // rows 9-10
	err := validateBattleshipFleet(fleet)
	require.Error(t, err)
	require.Contains(t, err.Error(), "out of bounds")
}

func TestValidateBattleshipFleet_Overlap(t *testing.T) {
	fleet := []models.BattleshipShip{
		{Name: "Carrier", Size: 5, Row: 0, Col: 0, Horizontal: true},
		{Name: "Battleship", Size: 4, Row: 0, Col: 2, Horizontal: true}, // overlaps with Carrier at (0,2)-(0,4)
		{Name: "Cruiser", Size: 3, Row: 2, Col: 0, Horizontal: true},
		{Name: "Submarine", Size: 3, Row: 3, Col: 0, Horizontal: true},
		{Name: "Destroyer", Size: 2, Row: 4, Col: 0, Horizontal: true},
	}
	err := validateBattleshipFleet(fleet)
	require.Error(t, err)
	require.Contains(t, err.Error(), "overlap")
}

// --- handlePlaceShips integration tests ---

func TestHandlePlaceShips_OnlyCreatorReady_BroadcastsSetupState(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, models.InitialBattleshipState())
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handlePlaceShips(creator.ID, GameAction{
		Type:    "place_ships",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"ships": standardFleet()},
	})

	creatorAction := mustReadGameAction(t, creatorClient)
	opponentAction := mustReadGameAction(t, opponentClient)
	require.Equal(t, "game_state", creatorAction.Type)
	require.Equal(t, "game_state", opponentAction.Type)

	var payload wireBattleshipStatePayload
	require.NoError(t, json.Unmarshal(creatorAction.Payload, &payload))
	require.Equal(t, "active", payload.Status)

	var board wireBattleshipBoard
	require.NoError(t, json.Unmarshal(payload.Board, &board))
	require.Equal(t, "setup", board.Phase)
	require.True(t, board.CreatorReady)
	require.False(t, board.OpponentReady)
}

func TestHandlePlaceShips_BothReady_TransitionsToBattle(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, models.InitialBattleshipState())
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	// Creator places ships — drain the first broadcast
	hub.handlePlaceShips(creator.ID, GameAction{
		Type:    "place_ships",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"ships": standardFleet()},
	})
	mustReadGameAction(t, creatorClient)
	mustReadGameAction(t, opponentClient)

	// Opponent places ships — should transition to battle
	hub.handlePlaceShips(opponent.ID, GameAction{
		Type:    "place_ships",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"ships": opponentFleet()},
	})

	creatorAction := mustReadGameAction(t, creatorClient)
	opponentAction := mustReadGameAction(t, opponentClient)
	require.Equal(t, "game_state", creatorAction.Type)
	require.Equal(t, "game_state", opponentAction.Type)

	var payload wireBattleshipStatePayload
	require.NoError(t, json.Unmarshal(creatorAction.Payload, &payload))

	var board wireBattleshipBoard
	require.NoError(t, json.Unmarshal(payload.Board, &board))
	require.Equal(t, "battle", board.Phase)

	// DB should reflect creator goes first after both ready
	var updated models.GameRoom
	require.NoError(t, db.First(&updated, room.ID).Error)
	require.Equal(t, creator.ID, updated.NextTurnID)
}

func TestHandlePlaceShips_DuplicatePlacement_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, models.InitialBattleshipState())
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	// First placement succeeds
	hub.handlePlaceShips(creator.ID, GameAction{
		Type:    "place_ships",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"ships": standardFleet()},
	})
	mustReadGameAction(t, creatorClient)
	mustReadGameAction(t, opponentClient)

	// Second placement from same player should error
	hub.handlePlaceShips(creator.ID, GameAction{
		Type:    "place_ships",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"ships": standardFleet()},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Contains(t, errPayload.Message, "already placed")

	expectNoMessage(t, opponentClient)
}

func TestHandlePlaceShips_InvalidFleet_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, models.InitialBattleshipState())
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handlePlaceShips(creator.ID, GameAction{
		Type:    "place_ships",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"ships": standardFleet()[:3]},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Contains(t, errPayload.Message, "expected 5 ships")

	expectNoMessage(t, opponentClient)
}

func TestHandlePlaceShips_NotBattleshipRoom_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	var board [6][7]string
	room := createConnectFourRoom(t, db, creator.ID, opponent.ID, board)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handlePlaceShips(creator.ID, GameAction{
		Type:    "place_ships",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"ships": standardFleet()},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Equal(t, "Not a Battleship game", errPayload.Message)
}

func TestHandleAction_PlaceShips_IsDispatched(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, models.InitialBattleshipState())
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	mutated := hub.HandleAction(creator.ID, GameAction{
		Type:    "place_ships",
		RoomID:  room.ID,
		Payload: map[string]interface{}{"ships": standardFleet()},
	})

	require.True(t, mutated)
	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "game_state", action.Type)
}

// --- handleMove (Battleship shots) integration tests ---

func TestHandleMove_Battleship_ValidShot_BroadcastsState(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	state := models.BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  standardFleet(),
		OpponentShips: opponentFleet(),
		CreatorShots:  [][2]int{},
		OpponentShots: [][2]int{},
	}
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]int{"row": 0, "col": 0},
	})

	creatorAction := mustReadGameAction(t, creatorClient)
	opponentAction := mustReadGameAction(t, opponentClient)
	require.Equal(t, "game_state", creatorAction.Type)
	require.Equal(t, "game_state", opponentAction.Type)

	var payload wireBattleshipStatePayload
	require.NoError(t, json.Unmarshal(creatorAction.Payload, &payload))
	require.Equal(t, "active", payload.Status)
	require.Equal(t, opponent.ID, payload.NextTurn)

	var board wireBattleshipBoard
	require.NoError(t, json.Unmarshal(payload.Board, &board))
	require.Len(t, board.CreatorShots, 1)
	require.Equal(t, [2]int{0, 0}, board.CreatorShots[0])
}

func TestHandleMove_Battleship_DuplicateShot_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	state := models.BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  standardFleet(),
		OpponentShips: opponentFleet(),
		CreatorShots:  [][2]int{{0, 0}}, // already fired here
		OpponentShots: [][2]int{},
	}
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]int{"row": 0, "col": 0},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Equal(t, "Already shot that cell", errPayload.Message)

	expectNoMessage(t, opponentClient)
}

func TestHandleMove_Battleship_OutOfBoundsShot_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	state := models.BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  standardFleet(),
		OpponentShips: opponentFleet(),
		CreatorShots:  [][2]int{},
		OpponentShots: [][2]int{},
	}
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]int{"row": 10, "col": 0},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Equal(t, "Shot out of bounds", errPayload.Message)

	expectNoMessage(t, opponentClient)
}

func TestHandleMove_Battleship_SetupPhase_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, models.InitialBattleshipState())
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]int{"row": 0, "col": 0},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Contains(t, errPayload.Message, "setup phase")

	expectNoMessage(t, opponentClient)
}

func TestHandleMove_Battleship_NotYourTurn_ReturnsError(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	state := models.BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  standardFleet(),
		OpponentShips: opponentFleet(),
		CreatorShots:  [][2]int{},
		OpponentShots: [][2]int{},
	}
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, state)
	_, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	// Opponent tries to fire when it's creator's turn
	hub.handleMove(opponent.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]int{"row": 0, "col": 0},
	})

	action := mustReadGameAction(t, opponentClient)
	require.Equal(t, "error", action.Type)
	var errPayload wireErrorPayload
	require.NoError(t, json.Unmarshal(action.Payload, &errPayload))
	require.Equal(t, "Not your turn", errPayload.Message)
}

func TestHandleMove_Battleship_FinishesAndAwards30Points(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)

	// Opponent's fleet = one Destroyer at (0,0) horizontal (cells [0,0] and [0,1]).
	// Creator has already hit [0,0]; firing [0,1] sinks it and wins the game.
	state := models.BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  standardFleet(),
		OpponentShips: []models.BattleshipShip{
			{Name: "Destroyer", Size: 2, Row: 0, Col: 0, Horizontal: true},
		},
		CreatorShots:  [][2]int{{0, 0}},
		OpponentShots: [][2]int{},
	}
	room := createBattleshipRoom(t, db, creator.ID, opponent.ID, state)
	creatorClient, _ := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	hub.handleMove(creator.ID, GameAction{
		Type:    "make_move",
		RoomID:  room.ID,
		Payload: map[string]int{"row": 0, "col": 1},
	})

	action := mustReadGameAction(t, creatorClient)
	require.Equal(t, "game_state", action.Type)

	var payload wireBattleshipStatePayload
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
	require.NoError(t, db.Where("user_id = ? AND game_type = ?", creator.ID, models.Battleship).First(&creatorStats).Error)
	require.Equal(t, 1, creatorStats.Wins)
	require.Equal(t, 1, creatorStats.TotalGames)
	require.Equal(t, 30, creatorStats.Points)

	var opponentStats models.GameStats
	require.NoError(t, db.Where("user_id = ? AND game_type = ?", opponent.ID, models.Battleship).First(&opponentStats).Error)
	require.Equal(t, 1, opponentStats.Losses)
	require.Equal(t, 1, opponentStats.TotalGames)
}
