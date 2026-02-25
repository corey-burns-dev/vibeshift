package models

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInitialCheckersBoard(t *testing.T) {
	board := InitialCheckersBoard()

	rCount, bCount := 0, 0
	for row := 0; row < 8; row++ {
		for col := 0; col < 8; col++ {
			cell := board[row][col]
			if cell != "" {
				// Must be on a dark square
				require.Equal(t, 1, (row+col)%2, "piece on light square at (%d,%d)", row, col)
			}
			switch cell {
			case "r":
				rCount++
				require.True(t, row >= 5, "r piece in wrong row %d", row)
			case "b":
				bCount++
				require.True(t, row <= 2, "b piece in wrong row %d", row)
			}
		}
	}
	require.Equal(t, 12, rCount)
	require.Equal(t, 12, bCount)
}

func TestGetCheckersState_EmptyCurrentState(t *testing.T) {
	room := &GameRoom{CurrentState: ""}
	s := room.GetCheckersState()
	require.Equal(t, InitialCheckersBoard(), s.Board)
	require.Nil(t, s.MustJumpFrom)
}

func TestGetCheckersState_ValidJSON(t *testing.T) {
	jumpFrom := [2]int{3, 4}
	state := CheckersState{
		Board:        InitialCheckersBoard(),
		MustJumpFrom: &jumpFrom,
	}
	raw, err := json.Marshal(state)
	require.NoError(t, err)

	room := &GameRoom{CurrentState: string(raw)}
	got := room.GetCheckersState()
	require.NotNil(t, got.MustJumpFrom)
	require.Equal(t, [2]int{3, 4}, *got.MustJumpFrom)
}

func TestGetCheckersState_InvalidJSON(t *testing.T) {
	room := &GameRoom{CurrentState: "not-json"}
	s := room.GetCheckersState()
	require.Equal(t, InitialCheckersBoard(), s.Board)
}

func TestGetCheckersJumps(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r"
	board[3][2] = "b" // opponent diag left → jump to (2,1)

	jumps := GetCheckersJumps(board, 4, 3)
	require.Len(t, jumps, 1)
	require.Equal(t, [2]int{2, 1}, jumps[0])
}

func TestGetCheckersJumps_King(t *testing.T) {
	var board [8][8]string
	board[2][3] = "R" // creator king
	board[3][4] = "b" // opponent behind → king can jump backwards

	jumps := GetCheckersJumps(board, 2, 3)
	require.Len(t, jumps, 1)
	require.Equal(t, [2]int{4, 5}, jumps[0])
}

func TestGetCheckersJumps_NoJumps(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r"
	// No opponent adjacent
	jumps := GetCheckersJumps(board, 4, 3)
	require.Empty(t, jumps)
}

func TestGetCheckersSimpleMoves(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r" // moves toward row 0

	moves := GetCheckersSimpleMoves(board, 4, 3)
	require.Len(t, moves, 2)
	require.Contains(t, moves, [2]int{3, 2})
	require.Contains(t, moves, [2]int{3, 4})
}

func TestGetCheckersSimpleMoves_King(t *testing.T) {
	var board [8][8]string
	board[4][3] = "R" // king can go all 4 directions

	moves := GetCheckersSimpleMoves(board, 4, 3)
	require.Len(t, moves, 4)
	require.Contains(t, moves, [2]int{3, 2})
	require.Contains(t, moves, [2]int{3, 4})
	require.Contains(t, moves, [2]int{5, 2})
	require.Contains(t, moves, [2]int{5, 4})
}

func TestGetCheckersSimpleMoves_OpponentDirection(t *testing.T) {
	var board [8][8]string
	board[4][3] = "b" // moves toward row 7

	moves := GetCheckersSimpleMoves(board, 4, 3)
	require.Len(t, moves, 2)
	require.Contains(t, moves, [2]int{5, 2})
	require.Contains(t, moves, [2]int{5, 4})
}

func TestHasAnyCheckersJump_True(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r"
	board[3][2] = "b" // b can jump r to (5,4); r can jump b to (2,1)

	require.True(t, HasAnyCheckersJump(board, "r"))
	require.True(t, HasAnyCheckersJump(board, "b"))
}

func TestHasAnyCheckersJump_OnlyOneSide(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r"
	board[1][0] = "b" // far away, no jump available for b

	require.False(t, HasAnyCheckersJump(board, "r"))
	require.False(t, HasAnyCheckersJump(board, "b"))
}

func TestHasAnyCheckersJump_False(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r"

	require.False(t, HasAnyCheckersJump(board, "r"))
}

func TestHasAnyCheckersMove_True(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r"
	require.True(t, HasAnyCheckersMove(board, "r"))
}

func TestHasAnyCheckersMove_False(t *testing.T) {
	// r piece in corner with no open diagonals
	var board [8][8]string
	board[0][1] = "r" // already at row 0, can't move further forward
	// No backward moves for non-king
	require.False(t, HasAnyCheckersMove(board, "r"))
}

func TestCountCheckersPieces(t *testing.T) {
	var board [8][8]string
	board[0][1] = "b"
	board[1][0] = "B" // king counts too
	board[5][0] = "r"
	board[6][1] = "R"
	board[7][0] = "r"

	rCount, bCount := CountCheckersPieces(board)
	require.Equal(t, 3, rCount)
	require.Equal(t, 2, bCount)
}

func TestCheckCheckersWin_CreatorWins_NoPieces(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r" // creator has piece, opponent has none
	state := CheckersState{Board: board}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Checkers, CurrentState: string(raw)}

	sym, won := room.CheckCheckersWin()
	require.True(t, won)
	require.Equal(t, "X", sym)
}

func TestCheckCheckersWin_OpponentWins_NoPieces(t *testing.T) {
	var board [8][8]string
	board[4][3] = "b"
	state := CheckersState{Board: board}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Checkers, CurrentState: string(raw)}

	sym, won := room.CheckCheckersWin()
	require.True(t, won)
	require.Equal(t, "O", sym)
}

func TestCheckCheckersWin_OpponentWins_NoMoves(t *testing.T) {
	// Creator piece stuck at row 0 (non-king can't move backward)
	var board [8][8]string
	board[0][1] = "r" // stuck
	board[5][0] = "b" // opponent has moves

	state := CheckersState{Board: board}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Checkers, CurrentState: string(raw)}

	sym, won := room.CheckCheckersWin()
	require.True(t, won)
	require.Equal(t, "O", sym) // opponent wins because creator has no legal moves
}

func TestCheckCheckersWin_Ongoing(t *testing.T) {
	var board [8][8]string
	board[4][3] = "r"
	board[2][1] = "b"

	state := CheckersState{Board: board}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Checkers, CurrentState: string(raw)}

	sym, won := room.CheckCheckersWin()
	require.False(t, won)
	require.Equal(t, "", sym)
}

func TestCheckCheckersWin_Draw(t *testing.T) {
	// Both sides have pieces but neither can move (extremely rare edge case)
	var board [8][8]string
	board[0][1] = "r" // stuck at row 0 (non-king)
	board[7][0] = "b" // stuck at row 7 (non-king)

	state := CheckersState{Board: board}
	raw, _ := json.Marshal(state)
	room := &GameRoom{Type: Checkers, CurrentState: string(raw)}

	sym, won := room.CheckCheckersWin()
	require.True(t, won)
	require.Equal(t, "", sym) // draw
}
