package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"sanctum/internal/models"
	"sanctum/internal/observability"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	// MaxGamePeersPerRoom prevents unbounded room growth
	MaxGamePeersPerRoom = 2 // Game rooms are currently 1v1
	// MaxGameTotalRooms prevents unbounded map growth
	MaxGameTotalRooms = 1000
)

// GameAction represents a message sent via WebSocket for games
type GameAction struct {
	Type    string      `json:"type"` // "create_room", "join_room", "make_move", "chat", "game_state", "error"
	RoomID  uint        `json:"room_id,omitempty"`
	UserID  uint        `json:"user_id,omitempty"`
	Payload interface{} `json:"payload"`
}

// GameHub manages real-time game interaction
type GameHub struct {
	mu sync.RWMutex

	// Map: roomID -> userID -> client
	rooms map[uint]map[uint]*Client

	// Map: userID -> set of rooms they are in
	userRooms map[uint]map[uint]struct{}

	db       *gorm.DB
	notifier *Notifier
}

// Name returns a human-readable identifier for this hub.
func (h *GameHub) Name() string { return "game hub" }

// NewGameHub creates a new GameHub instance
func NewGameHub(db *gorm.DB, notifier *Notifier) *GameHub {
	return &GameHub{
		rooms:     make(map[uint]map[uint]*Client),
		userRooms: make(map[uint]map[uint]struct{}),
		db:        db,
		notifier:  notifier,
	}
}

// RegisterClient registers a user's client in a room. Returns error if limits exceeded.
func (h *GameHub) RegisterClient(roomID uint, client *Client) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Enforce total room count limit
	if h.rooms[roomID] == nil && len(h.rooms) >= MaxGameTotalRooms {
		return fmt.Errorf("too many active rooms")
	}

	if h.rooms[roomID] == nil {
		h.rooms[roomID] = make(map[uint]*Client)
	}

	// Allow reconnection: if user is already in this room, replace their client.
	// Only enforce per-room peer limit for genuinely new users.
	if _, alreadyIn := h.rooms[roomID][client.UserID]; !alreadyIn {
		if len(h.rooms[roomID]) >= MaxGamePeersPerRoom {
			return fmt.Errorf("room is full")
		}
	} else {
		observability.GlobalLogger.InfoContext(context.Background(), "game hub user reconnecting in room",
			slog.Uint64("user_id", uint64(client.UserID)),
			slog.Uint64("room_id", uint64(roomID)),
		)
	}

	h.rooms[roomID][client.UserID] = client

	if h.userRooms[client.UserID] == nil {
		h.userRooms[client.UserID] = make(map[uint]struct{})
	}
	h.userRooms[client.UserID][roomID] = struct{}{}

	observability.GlobalLogger.InfoContext(context.Background(), "game hub user registered in room",
		slog.Uint64("user_id", uint64(client.UserID)),
		slog.Uint64("room_id", uint64(roomID)),
	)
	return nil
}

// UnregisterClient removes a user's client from all rooms
func (h *GameHub) UnregisterClient(client *Client) {
	h.mu.Lock()
	userID := client.UserID
	rooms, ok := h.userRooms[userID]
	if !ok {
		h.mu.Unlock()
		return
	}

	// Remove only the rooms for which this exact client is registered.
	// This avoids deleting tracking when a newer socket replaced an old one.
	for roomID := range rooms {
		if room, ok := h.rooms[roomID]; ok {
			if c, ok := room[userID]; ok && c == client {
				// Remove this client's registration for the room
				delete(room, userID)
				// If room is now empty, remove it entirely
				if len(room) == 0 {
					delete(h.rooms, roomID)
				}

				// Also remove the room from the user's tracked set
				delete(h.userRooms[userID], roomID)

			}
		}
	}

	// If the user has no remaining tracked rooms, remove the entry entirely
	if len(h.userRooms[userID]) == 0 {
		delete(h.userRooms, userID)
	}
	h.mu.Unlock()
}

// BroadcastToRoom sends a message to all users in a game room
func (h *GameHub) BroadcastToRoom(roomID uint, action GameAction) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users, ok := h.rooms[roomID]
	if !ok {
		return
	}

	actionJSON, err := json.Marshal(action)
	if err != nil {
		observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to marshal action",
			slog.String("error", err.Error()),
		)
		return
	}

	for _, client := range users {
		client.TrySend(actionJSON)
	}
}

// HandleAction processes an incoming game action and returns true if the room
// state was mutated (i.e. the action succeeded), false otherwise.
func (h *GameHub) HandleAction(userID uint, action GameAction) bool {
	switch action.Type {
	case "join_room":
		return h.handleJoin(userID, action)
	case "make_move":
		return h.handleMove(userID, action)
	case "place_ships":
		return h.handlePlaceShips(userID, action)
	case "chat":
		h.handleChat(userID, action)
		return false
	default:
		observability.GlobalLogger.InfoContext(context.Background(), "game hub unknown action type",
			slog.String("action_type", action.Type),
			slog.Uint64("user_id", uint64(userID)),
		)
		return false
	}
}

func (h *GameHub) handleJoin(userID uint, action GameAction) bool {
	var room models.GameRoom
	if err := h.db.First(&room, action.RoomID).Error; err != nil {
		h.sendError(userID, action.RoomID, "Game room not found")
		return false
	}

	if room.Status != models.GamePending {
		h.sendError(userID, action.RoomID, "Game already started or finished")
		return false
	}

	if room.CreatorID != nil && *room.CreatorID == userID {
		h.sendError(userID, action.RoomID, "You are the creator")
		return false
	}

	if room.CreatorID == nil {
		h.sendError(userID, action.RoomID, "Game creator no longer exists")
		return false
	}

	// Join as opponent
	room.OpponentID = &userID
	room.Status = models.GameActive
	room.NextTurnID = *room.CreatorID // Creator goes first

	// For Battleship, initialise the setup-phase state so both players can
	// place ships simultaneously before the battle begins.
	if room.Type == models.Battleship {
		initialState := models.InitialBattleshipState()
		room.SetState(initialState)
	}

	if err := h.db.Save(&room).Error; err != nil {
		h.sendError(userID, action.RoomID, "Failed to start game")
		return false
	}

	started := GameAction{
		Type:   "game_started",
		RoomID: action.RoomID,
		Payload: map[string]interface{}{
			"status":        "active",
			"next_turn":     room.NextTurnID,
			"opponent_id":   userID,
			"creator_id":    room.CreatorID,
			"room_id":       room.ID,
			"updated_at":    room.UpdatedAt,
			"current_state": room.CurrentState,
		},
	}

	// Always broadcast directly to currently connected sockets in this process.
	h.BroadcastToRoom(action.RoomID, started)

	// Also publish through Redis for cross-process fanout when available.
	if h.notifier != nil {
		_ = h.notifier.PublishGameAction(
			context.Background(),
			action.RoomID,
			`{"type": "game_started", "payload": {"status": "active", "next_turn": `+fmt.Sprint(room.NextTurnID)+`}}`,
		)
	}
	return true
}

func (h *GameHub) handleMove(userID uint, action GameAction) bool {
	var room models.GameRoom
	if err := h.db.First(&room, action.RoomID).Error; err != nil {
		h.sendError(userID, action.RoomID, "Game room not found")
		return false
	}

	if room.Status != models.GameActive || room.NextTurnID != userID {
		h.sendError(userID, action.RoomID, "Not your turn")
		return false
	}

	moveBytes, _ := json.Marshal(action.Payload)

	var board interface{}
	var symbol string
	var winnerSym string
	finished := false
	skipDefaultTurnSwitch := false

	if room.OpponentID != nil && userID == *room.OpponentID {
		symbol = "O"
	} else {
		symbol = "X"
	}

	switch room.Type {
	case models.ConnectFour:
		var moveData models.ConnectFourMove
		if err := json.Unmarshal(moveBytes, &moveData); err != nil {
			h.sendError(userID, action.RoomID, "Invalid move format")
			return false
		}

		c4Board := room.GetConnectFourState()
		if moveData.Column < 0 || moveData.Column > 6 || c4Board[0][moveData.Column] != "" {
			h.sendError(userID, action.RoomID, "Invalid move location or column full")
			return false
		}

		// Gravity: find lowest empty row
		found := false
		for r := 5; r >= 0; r-- {
			if c4Board[r][moveData.Column] == "" {
				c4Board[r][moveData.Column] = symbol
				found = true
				break
			}
		}

		if !found {
			h.sendError(userID, action.RoomID, "Column is full")
			return false
		}

		board = c4Board
		room.SetState(c4Board)
	case models.Othello:
		var moveData models.OthelloMove
		if err := json.Unmarshal(moveBytes, &moveData); err != nil {
			h.sendError(userID, action.RoomID, "Invalid move format")
			return false
		}

		othelloBoard := room.GetOthelloState()
		if !applyOthelloMove(&othelloBoard, moveData.Row, moveData.Column, symbol) {
			h.sendError(userID, action.RoomID, "Invalid move location")
			return false
		}

		board = othelloBoard
		room.SetState(othelloBoard)

		opponentSymbol := "O"
		if symbol == "O" {
			opponentSymbol = "X"
		}

		hasCurrentMoves := hasAnyOthelloMove(othelloBoard, symbol)
		hasOpponentMoves := hasAnyOthelloMove(othelloBoard, opponentSymbol)

		if !hasCurrentMoves && !hasOpponentMoves {
			finished = true
			xCount, oCount := countOthelloPieces(othelloBoard)
			switch {
			case xCount > oCount:
				winnerSym = "X"
			case oCount > xCount:
				winnerSym = "O"
			default:
				winnerSym = ""
			}
		} else {
			skipDefaultTurnSwitch = true
			if hasOpponentMoves {
				switch {
				case symbol == "X" && room.OpponentID != nil:
					room.NextTurnID = *room.OpponentID
				case symbol == "O" && room.CreatorID != nil:
					room.NextTurnID = *room.CreatorID
				default:
					room.Status = models.GameCancelled
				}
			} else {
				// Opponent has no legal move; current player moves again.
				room.NextTurnID = userID
			}
		}
	case models.Battleship:
		var moveData models.BattleshipShotMove
		if err := json.Unmarshal(moveBytes, &moveData); err != nil {
			h.sendError(userID, action.RoomID, "Invalid move format")
			return false
		}

		bsState := room.GetBattleshipState()
		if bsState.Phase != "battle" {
			h.sendError(userID, action.RoomID, "Game is still in setup phase")
			return false
		}

		if moveData.Row < 0 || moveData.Row > 9 || moveData.Col < 0 || moveData.Col > 9 {
			h.sendError(userID, action.RoomID, "Shot out of bounds")
			return false
		}

		shot := [2]int{moveData.Row, moveData.Col}
		isCreatorShot := room.CreatorID != nil && userID == *room.CreatorID

		if isCreatorShot {
			for _, s := range bsState.CreatorShots {
				if s == shot {
					h.sendError(userID, action.RoomID, "Already shot that cell")
					return false
				}
			}
			bsState.CreatorShots = append(bsState.CreatorShots, shot)
		} else {
			for _, s := range bsState.OpponentShots {
				if s == shot {
					h.sendError(userID, action.RoomID, "Already shot that cell")
					return false
				}
			}
			bsState.OpponentShots = append(bsState.OpponentShots, shot)
		}

		board = bsState
		room.SetState(bsState)

	default:
		h.sendError(userID, action.RoomID, "Unsupported game type")
		return false
	}

	// Determine move number by counting existing moves for this room
	var moveCount int64
	h.db.Model(&models.GameMove{}).Where("game_room_id = ?", room.ID).Count(&moveCount)

	// Persist move
	moveRecord := models.GameMove{
		GameRoomID: room.ID,
		UserID:     userID,
		MoveData:   string(moveBytes),
		MoveNumber: int(moveCount) + 1,
	}
	if err := h.db.Create(&moveRecord).Error; err != nil {
		observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to persist move",
			slog.Uint64("room_id", uint64(room.ID)),
			slog.String("error", err.Error()),
		)
	}

	if room.Type != models.Othello {
		winnerSym, finished = room.CheckWin()
	}

	// Check for win/draw
	if finished {
		room.Status = models.GameFinished
		if winnerSym != "" {
			winID := room.CreatorID
			if winnerSym == "O" && room.OpponentID != nil {
				winID = room.OpponentID
			}
			room.WinnerID = winID

			// Award points if winner still exists (upsert to handle missing rows)
			if winID != nil {
				points := 10
				switch room.Type {
				case models.ConnectFour:
					points = 15
				case models.Othello:
					points = 25
				case models.Battleship:
					points = 30
				}
				winStats := models.GameStats{UserID: *winID, GameType: room.Type, Wins: 1, TotalGames: 1, Points: points}
				if err := h.db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "user_id"}, {Name: "game_type"}},
					DoUpdates: clause.Assignments(map[string]interface{}{
						"points":      gorm.Expr("game_stats.points + ?", points),
						"wins":        gorm.Expr("game_stats.wins + ?", 1),
						"total_games": gorm.Expr("game_stats.total_games + ?", 1),
					}),
				}).Create(&winStats).Error; err != nil {
					observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to award winner points",
						slog.Uint64("winner_id", uint64(*winID)),
						slog.String("error", err.Error()),
					)
				}
			}

			lossID := room.CreatorID
			if winID == room.CreatorID && room.OpponentID != nil {
				lossID = room.OpponentID
			}

			if lossID != nil {
				lossStats := models.GameStats{UserID: *lossID, GameType: room.Type, Losses: 1, TotalGames: 1}
				if err := h.db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "user_id"}, {Name: "game_type"}},
					DoUpdates: clause.Assignments(map[string]interface{}{
						"losses":      gorm.Expr("game_stats.losses + ?", 1),
						"total_games": gorm.Expr("game_stats.total_games + ?", 1),
					}),
				}).Create(&lossStats).Error; err != nil {
					observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to update loser stats",
						slog.Uint64("loser_id", uint64(*lossID)),
						slog.String("error", err.Error()),
					)
				}
			}
		} else {
			room.IsDraw = true
			userIDs := make([]uint, 0, 2)
			if room.CreatorID != nil {
				userIDs = append(userIDs, *room.CreatorID)
			}
			if room.OpponentID != nil {
				userIDs = append(userIDs, *room.OpponentID)
			}

			for _, uid := range userIDs {
				drawStats := models.GameStats{UserID: uid, GameType: room.Type, Draws: 1, TotalGames: 1}
				if err := h.db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "user_id"}, {Name: "game_type"}},
					DoUpdates: clause.Assignments(map[string]interface{}{
						"draws":       gorm.Expr("game_stats.draws + ?", 1),
						"total_games": gorm.Expr("game_stats.total_games + ?", 1),
					}),
				}).Create(&drawStats).Error; err != nil {
					observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to update draw stats",
						slog.Uint64("user_id", uint64(uid)),
						slog.String("error", err.Error()),
					)
				}
			}
		}
	} else if !skipDefaultTurnSwitch {
		// Switch turn
		switch {
		case room.CreatorID != nil && userID == *room.CreatorID && room.OpponentID != nil:
			room.NextTurnID = *room.OpponentID
		case room.CreatorID != nil:
			room.NextTurnID = *room.CreatorID
		default:
			// Creator deleted during game, and it was their turn?
			// Or creator deleted and it's now their turn.
			// If creator is nil, we can't really continue easily if it's their turn.
			// But the logic above should ideally handle it.
			room.Status = models.GameCancelled
		}
	}

	if err := h.db.Save(&room).Error; err != nil {
		observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to save room state",
			slog.Uint64("room_id", uint64(room.ID)),
			slog.String("error", err.Error()),
		)
	}

	// Broadcast update
	action.Type = "game_state"
	action.Payload = map[string]interface{}{
		"board":     board,
		"status":    room.Status,
		"winner_id": room.WinnerID,
		"next_turn": room.NextTurnID,
		"is_draw":   room.IsDraw,
	}

	// Always broadcast directly to connected sockets in this process.
	h.BroadcastToRoom(action.RoomID, action)

	// Also publish through Redis for cross-process fanout when available.
	if h.notifier != nil {
		actionJSON, _ := json.Marshal(action)
		_ = h.notifier.PublishGameAction(context.Background(), action.RoomID, string(actionJSON))
	}
	return true
}

var othelloDirs = [8][2]int{
	{-1, -1}, {-1, 0}, {-1, 1},
	{0, -1}, {0, 1},
	{1, -1}, {1, 0}, {1, 1},
}

func inOthelloBounds(row, col int) bool {
	return row >= 0 && row < 8 && col >= 0 && col < 8
}

func canCaptureOthelloDirection(board [8][8]string, row, col, dRow, dCol int, symbol string) bool {
	opponent := "O"
	if symbol == "O" {
		opponent = "X"
	}

	r := row + dRow
	c := col + dCol
	seenOpponent := false

	for inOthelloBounds(r, c) && board[r][c] == opponent {
		seenOpponent = true
		r += dRow
		c += dCol
	}

	return seenOpponent && inOthelloBounds(r, c) && board[r][c] == symbol
}

func applyOthelloMove(board *[8][8]string, row, col int, symbol string) bool {
	if !inOthelloBounds(row, col) || board[row][col] != "" {
		return false
	}

	captured := false
	for _, dir := range othelloDirs {
		if !canCaptureOthelloDirection(*board, row, col, dir[0], dir[1], symbol) {
			continue
		}

		captured = true
		r := row + dir[0]
		c := col + dir[1]
		for inOthelloBounds(r, c) && board[r][c] != symbol {
			board[r][c] = symbol
			r += dir[0]
			c += dir[1]
		}
	}

	if !captured {
		return false
	}

	board[row][col] = symbol
	return true
}

func hasAnyOthelloMove(board [8][8]string, symbol string) bool {
	for row := 0; row < 8; row++ {
		for col := 0; col < 8; col++ {
			if board[row][col] != "" {
				continue
			}
			for _, dir := range othelloDirs {
				if canCaptureOthelloDirection(board, row, col, dir[0], dir[1], symbol) {
					return true
				}
			}
		}
	}
	return false
}

func countOthelloPieces(board [8][8]string) (int, int) {
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

	return xCount, oCount
}

func (h *GameHub) handlePlaceShips(userID uint, action GameAction) bool {
	var room models.GameRoom
	if err := h.db.First(&room, action.RoomID).Error; err != nil {
		h.sendError(userID, action.RoomID, "Game room not found")
		return false
	}

	if room.Status != models.GameActive {
		h.sendError(userID, action.RoomID, "Game is not active")
		return false
	}

	if room.Type != models.Battleship {
		h.sendError(userID, action.RoomID, "Not a Battleship game")
		return false
	}

	moveBytes, _ := json.Marshal(action.Payload)
	var moveData models.BattleshipPlaceShipsMove
	if err := json.Unmarshal(moveBytes, &moveData); err != nil {
		h.sendError(userID, action.RoomID, "Invalid ship placement format")
		return false
	}

	if err := validateBattleshipFleet(moveData.Ships); err != nil {
		h.sendError(userID, action.RoomID, err.Error())
		return false
	}

	state := room.GetBattleshipState()
	if state.Phase != "setup" {
		h.sendError(userID, action.RoomID, "Ships already placed")
		return false
	}

	isCreator := room.CreatorID != nil && userID == *room.CreatorID
	isOpponent := room.OpponentID != nil && userID == *room.OpponentID

	if !isCreator && !isOpponent {
		h.sendError(userID, action.RoomID, "You are not a player in this room")
		return false
	}

	if isCreator {
		if state.CreatorReady {
			h.sendError(userID, action.RoomID, "Ships already placed")
			return false
		}
		state.CreatorShips = moveData.Ships
		state.CreatorReady = true
	} else {
		if state.OpponentReady {
			h.sendError(userID, action.RoomID, "Ships already placed")
			return false
		}
		state.OpponentShips = moveData.Ships
		state.OpponentReady = true
	}

	// Transition to battle when both players have placed their ships.
	if state.CreatorReady && state.OpponentReady {
		state.Phase = "battle"
		if room.CreatorID != nil {
			room.NextTurnID = *room.CreatorID
		}
	}

	room.SetState(state)
	if err := h.db.Save(&room).Error; err != nil {
		observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to save battleship placement",
			slog.Uint64("room_id", uint64(room.ID)),
			slog.String("error", err.Error()),
		)
		h.sendError(userID, action.RoomID, "Failed to save ship placement")
		return false
	}

	action.Type = "game_state"
	action.Payload = map[string]interface{}{
		"board":     state,
		"status":    room.Status,
		"winner_id": room.WinnerID,
		"next_turn": room.NextTurnID,
		"is_draw":   room.IsDraw,
	}
	h.BroadcastToRoom(action.RoomID, action)

	if h.notifier != nil {
		actionJSON, _ := json.Marshal(action)
		_ = h.notifier.PublishGameAction(context.Background(), action.RoomID, string(actionJSON))
	}
	return true
}

// validateBattleshipFleet checks that ships is the standard Battleship fleet
// (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2) and that
// every ship fits within the 10×10 grid with no overlaps.
func validateBattleshipFleet(ships []models.BattleshipShip) error {
	expected := map[string]int{
		"Carrier":    5,
		"Battleship": 4,
		"Cruiser":    3,
		"Submarine":  3,
		"Destroyer":  2,
	}

	if len(ships) != len(expected) {
		return fmt.Errorf("invalid fleet: expected %d ships", len(expected))
	}

	seen := make(map[string]bool)
	occupied := make(map[[2]int]bool)

	for _, ship := range ships {
		size, ok := expected[ship.Name]
		if !ok {
			return fmt.Errorf("unknown ship: %s", ship.Name)
		}
		if seen[ship.Name] {
			return fmt.Errorf("duplicate ship: %s", ship.Name)
		}
		if ship.Size != size {
			return fmt.Errorf("wrong size for %s: expected %d", ship.Name, size)
		}
		seen[ship.Name] = true

		for i := 0; i < ship.Size; i++ {
			var cell [2]int
			if ship.Horizontal {
				cell = [2]int{ship.Row, ship.Col + i}
			} else {
				cell = [2]int{ship.Row + i, ship.Col}
			}
			if cell[0] < 0 || cell[0] > 9 || cell[1] < 0 || cell[1] > 9 {
				return fmt.Errorf("ship %s extends out of bounds", ship.Name)
			}
			if occupied[cell] {
				return fmt.Errorf("ships overlap at row %d col %d", cell[0], cell[1])
			}
			occupied[cell] = true
		}
	}
	return nil
}

func (h *GameHub) handleChat(userID uint, action GameAction) {
	// Persist the message so players who navigate away can fetch it on return.
	payload, _ := action.Payload.(map[string]interface{})
	text, _ := payload["text"].(string)
	username, _ := payload["username"].(string)
	if text != "" && username != "" {
		msg := models.GameRoomMessage{
			GameRoomID: action.RoomID,
			UserID:     userID,
			Username:   username,
			Text:       text,
		}
		if err := h.db.Create(&msg).Error; err != nil {
			observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to persist room chat message",
				slog.Uint64("room_id", uint64(action.RoomID)),
				slog.String("error", err.Error()),
			)
		} else {
			// Trim to keep at most MaxGameRoomMessages per room.
			var total int64
			if err := h.db.Model(&models.GameRoomMessage{}).
				Where("game_room_id = ?", action.RoomID).
				Count(&total).Error; err != nil {
				observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to count room chat messages",
					slog.Uint64("room_id", uint64(action.RoomID)),
					slog.String("error", err.Error()),
				)
			} else if total > models.MaxGameRoomMessages {
				excess := total - models.MaxGameRoomMessages
				oldestIDs := h.db.Model(&models.GameRoomMessage{}).
					Select("id").
					Where("game_room_id = ?", action.RoomID).
					Order("created_at ASC, id ASC").
					Limit(int(excess))
				if err := h.db.Where("id IN (?)", oldestIDs).
					Delete(&models.GameRoomMessage{}).Error; err != nil {
					observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to trim room chat messages",
						slog.Uint64("room_id", uint64(action.RoomID)),
						slog.String("error", err.Error()),
					)
				}
			}
		}
	}

	h.BroadcastToRoom(action.RoomID, action)
}

func (h *GameHub) sendError(userID, roomID uint, message string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, ok := h.rooms[roomID]
	if !ok {
		return
	}

	client, ok := room[userID]
	if !ok {
		return
	}

	resp := GameAction{
		Type:   "error",
		RoomID: roomID,
		Payload: map[string]string{
			"message": message,
		},
	}
	respJSON, _ := json.Marshal(resp)
	client.TrySend(respJSON)
}

// StartWiring connects GameHub to Redis
func (h *GameHub) StartWiring(ctx context.Context, n *Notifier) error {
	return n.StartGameSubscriber(ctx, func(channel, payload string) {
		var roomID uint
		if _, err := fmt.Sscanf(channel, "game:room:%d", &roomID); err != nil {
			return
		}

		var action GameAction
		if err := json.Unmarshal([]byte(payload), &action); err != nil {
			return
		}
		action.RoomID = roomID

		h.BroadcastToRoom(roomID, action)
	})
}

// Shutdown gracefully closes all websocket connections
func (h *GameHub) Shutdown(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Close all room connections
	for roomID, users := range h.rooms {
		for userID, client := range users {
			shutdownMsg := GameAction{
				Type:    "server_shutdown",
				RoomID:  roomID,
				Payload: map[string]string{"message": "Server is shutting down"},
			}
			if msgJSON, err := json.Marshal(shutdownMsg); err == nil {
				client.TrySend(msgJSON)
			}
			if err := client.Conn.Close(); err != nil {
				observability.GlobalLogger.ErrorContext(context.Background(), "game hub failed to close websocket",
					slog.Uint64("room_id", uint64(roomID)),
					slog.Uint64("user_id", uint64(userID)),
					slog.String("error", err.Error()),
				)
			}
		}
	}

	// Clear all state
	h.rooms = make(map[uint]map[uint]*Client)
	h.userRooms = make(map[uint]map[uint]struct{})

	return nil
}
