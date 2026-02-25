package models

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInitialBattleshipState(t *testing.T) {
	s := InitialBattleshipState()
	require.Equal(t, "setup", s.Phase)
	require.False(t, s.CreatorReady)
	require.False(t, s.OpponentReady)
	require.NotNil(t, s.CreatorShips)
	require.NotNil(t, s.OpponentShips)
	require.NotNil(t, s.CreatorShots)
	require.NotNil(t, s.OpponentShots)
}

func TestGetBattleshipState_EmptyCurrentState(t *testing.T) {
	room := &GameRoom{CurrentState: ""}
	s := room.GetBattleshipState()
	require.Equal(t, "setup", s.Phase)
}

func TestGetBattleshipState_ValidJSON(t *testing.T) {
	state := BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  []BattleshipShip{{Name: "Destroyer", Size: 2, Row: 0, Col: 0, Horizontal: true}},
		OpponentShips: []BattleshipShip{},
		CreatorShots:  [][2]int{{1, 2}},
		OpponentShots: [][2]int{},
	}
	raw, err := json.Marshal(state)
	require.NoError(t, err)

	room := &GameRoom{CurrentState: string(raw)}
	got := room.GetBattleshipState()
	require.Equal(t, "battle", got.Phase)
	require.True(t, got.CreatorReady)
	require.True(t, got.OpponentReady)
	require.Len(t, got.CreatorShips, 1)
	require.Equal(t, "Destroyer", got.CreatorShips[0].Name)
	require.Equal(t, [2]int{1, 2}, got.CreatorShots[0])
}

func TestGetBattleshipState_InvalidJSON(t *testing.T) {
	room := &GameRoom{CurrentState: "not-json"}
	s := room.GetBattleshipState()
	require.Equal(t, "setup", s.Phase)
}

func TestAllBattleshipShipsSunk_NoShips_ReturnsFalse(t *testing.T) {
	result := allBattleshipShipsSunk([]BattleshipShip{}, [][2]int{{0, 0}})
	require.False(t, result)
}

func TestAllBattleshipShipsSunk_HorizontalShip_AllHit(t *testing.T) {
	ships := []BattleshipShip{{Name: "Carrier", Size: 5, Row: 0, Col: 0, Horizontal: true}}
	shots := [][2]int{{0, 0}, {0, 1}, {0, 2}, {0, 3}, {0, 4}}
	require.True(t, allBattleshipShipsSunk(ships, shots))
}

func TestAllBattleshipShipsSunk_HorizontalShip_PartialHit(t *testing.T) {
	ships := []BattleshipShip{{Name: "Carrier", Size: 5, Row: 0, Col: 0, Horizontal: true}}
	shots := [][2]int{{0, 0}, {0, 1}, {0, 2}, {0, 3}}
	require.False(t, allBattleshipShipsSunk(ships, shots))
}

func TestAllBattleshipShipsSunk_VerticalShip_AllHit(t *testing.T) {
	ships := []BattleshipShip{{Name: "Destroyer", Size: 2, Row: 3, Col: 5, Horizontal: false}}
	shots := [][2]int{{3, 5}, {4, 5}}
	require.True(t, allBattleshipShipsSunk(ships, shots))
}

func TestCheckBattleshipWin_SetupPhase_ReturnsFalse(t *testing.T) {
	state := BattleshipState{
		Phase:         "setup",
		OpponentShips: []BattleshipShip{{Name: "Destroyer", Size: 2, Row: 0, Col: 0, Horizontal: true}},
		CreatorShots:  [][2]int{{0, 0}, {0, 1}},
	}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Battleship, CurrentState: string(raw)}
	sym, won := room.CheckBattleshipWin()
	require.False(t, won)
	require.Equal(t, "", sym)
}

func TestCheckBattleshipWin_CreatorWins(t *testing.T) {
	state := BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  []BattleshipShip{},
		OpponentShips: []BattleshipShip{{Name: "Destroyer", Size: 2, Row: 0, Col: 0, Horizontal: true}},
		CreatorShots:  [][2]int{{0, 0}, {0, 1}},
		OpponentShots: [][2]int{},
	}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Battleship, CurrentState: string(raw)}
	sym, won := room.CheckBattleshipWin()
	require.True(t, won)
	require.Equal(t, "X", sym)
}

func TestCheckBattleshipWin_OpponentWins(t *testing.T) {
	state := BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  []BattleshipShip{{Name: "Destroyer", Size: 2, Row: 0, Col: 0, Horizontal: true}},
		OpponentShips: []BattleshipShip{},
		CreatorShots:  [][2]int{},
		OpponentShots: [][2]int{{0, 0}, {0, 1}},
	}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Battleship, CurrentState: string(raw)}
	sym, won := room.CheckBattleshipWin()
	require.True(t, won)
	require.Equal(t, "O", sym)
}

func TestCheckBattleshipWin_NoWinner(t *testing.T) {
	state := BattleshipState{
		Phase:         "battle",
		CreatorReady:  true,
		OpponentReady: true,
		CreatorShips:  []BattleshipShip{{Name: "Destroyer", Size: 2, Row: 1, Col: 0, Horizontal: true}},
		OpponentShips: []BattleshipShip{{Name: "Destroyer", Size: 2, Row: 0, Col: 0, Horizontal: true}},
		CreatorShots:  [][2]int{{0, 0}}, // one hit, not sunk
		OpponentShots: [][2]int{},
	}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Battleship, CurrentState: string(raw)}
	sym, won := room.CheckBattleshipWin()
	require.False(t, won)
	require.Equal(t, "", sym)
}
