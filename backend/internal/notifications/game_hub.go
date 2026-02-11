package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"sanctum/internal/models"

	"github.com/gofiber/websocket/v2"
	"gorm.io/gorm"
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

	// Map: roomID -> userID -> connection
	rooms map[uint]map[uint]*websocket.Conn

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
		rooms:     make(map[uint]map[uint]*websocket.Conn),
		userRooms: make(map[uint]map[uint]struct{}),
		db:        db,
		notifier:  notifier,
	}
}

// Register registers a user's connection in a room
func (h *GameHub) Register(userID, roomID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.rooms[roomID] == nil {
		h.rooms[roomID] = make(map[uint]*websocket.Conn)
	}
	h.rooms[roomID][userID] = conn

	if h.userRooms[userID] == nil {
		h.userRooms[userID] = make(map[uint]struct{})
	}
	h.userRooms[userID][roomID] = struct{}{}

	log.Printf("GameHub: User %d registered in room %d", userID, roomID)
}

// Unregister removes a user's connection
func (h *GameHub) Unregister(userID, roomID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.rooms[roomID]; ok {
		if c, ok := room[userID]; ok && c == conn {
			delete(room, userID)
			if len(room) == 0 {
				delete(h.rooms, roomID)
			}
		}
	}

	if rooms, ok := h.userRooms[userID]; ok {
		delete(rooms, roomID)
		if len(rooms) == 0 {
			delete(h.userRooms, userID)
		}
	}

	// Database cleanup: If the creator leaves a pending room, cancel it
	var room models.GameRoom
	if err := h.db.First(&room, roomID).Error; err == nil {
		if room.Status == models.GamePending && room.CreatorID == userID {
			room.Status = models.GameCancelled
			h.db.Save(&room)
			log.Printf("GameHub: Pending room %d cancelled because creator (User %d) disconnected", roomID, userID)
		}
	}
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
		log.Printf("GameHub: Failed to marshal action: %v", err)
		return
	}

	for _, conn := range users {
		if err := conn.WriteMessage(websocket.TextMessage, actionJSON); err != nil {
			log.Printf("GameHub: WebSocket write error in room %d: %v", roomID, err)
		}
	}
}

// HandleAction processes an incoming game action
func (h *GameHub) HandleAction(userID uint, action GameAction) {
	switch action.Type {
	case "join_room":
		h.handleJoin(userID, action)
	case "make_move":
		h.handleMove(userID, action)
	case "chat":
		h.handleChat(userID, action)
	default:
		log.Printf("GameHub: Unknown action type %s from user %d", action.Type, userID)
	}
}

func (h *GameHub) handleJoin(userID uint, action GameAction) {
	var room models.GameRoom
	if err := h.db.First(&room, action.RoomID).Error; err != nil {
		h.sendError(userID, action.RoomID, "Game room not found")
		return
	}

	if room.Status != models.GamePending {
		h.sendError(userID, action.RoomID, "Game already started or finished")
		return
	}

	if room.CreatorID == userID {
		h.sendError(userID, action.RoomID, "You are the creator")
		return
	}

	// Join as opponent
	room.OpponentID = &userID
	room.Status = models.GameActive
	room.NextTurnID = room.CreatorID // Creator goes first

	if err := h.db.Save(&room).Error; err != nil {
		h.sendError(userID, action.RoomID, "Failed to start game")
		return
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
}

func (h *GameHub) handleMove(userID uint, action GameAction) {
	var room models.GameRoom
	if err := h.db.First(&room, action.RoomID).Error; err != nil {
		h.sendError(userID, action.RoomID, "Game room not found")
		return
	}

	if room.Status != models.GameActive || room.NextTurnID != userID {
		h.sendError(userID, action.RoomID, "Not your turn")
		return
	}

	moveBytes, _ := json.Marshal(action.Payload)

	var board interface{}
	var symbol string
	if room.OpponentID != nil && userID == *room.OpponentID {
		symbol = "O"
	} else {
		symbol = "X"
	}

	if room.Type == models.TicTacToe {
		var moveData models.TicTacToeMove
		if err := json.Unmarshal(moveBytes, &moveData); err != nil {
			h.sendError(userID, action.RoomID, "Invalid move format")
			return
		}

		tttBoard := room.GetTicTacToeState()
		if moveData.X < 0 || moveData.X > 2 || moveData.Y < 0 || moveData.Y > 2 || tttBoard[moveData.X][moveData.Y] != "" {
			h.sendError(userID, action.RoomID, "Invalid move location")
			return
		}
		tttBoard[moveData.X][moveData.Y] = symbol
		board = tttBoard
		room.SetState(tttBoard)
	} else if room.Type == models.ConnectFour {
		var moveData models.ConnectFourMove
		if err := json.Unmarshal(moveBytes, &moveData); err != nil {
			h.sendError(userID, action.RoomID, "Invalid move format")
			return
		}

		c4Board := room.GetConnectFourState()
		if moveData.Column < 0 || moveData.Column > 6 || c4Board[0][moveData.Column] != "" {
			h.sendError(userID, action.RoomID, "Invalid move location or column full")
			return
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
			return
		}

		board = c4Board
		room.SetState(c4Board)
	}

	// Persist move
	moveRecord := models.GameMove{
		GameRoomID: room.ID,
		UserID:     userID,
		MoveData:   string(moveBytes),
	}
	h.db.Create(&moveRecord)

	// Check for win/draw
	winnerSym, finished := room.CheckWin()
	if finished {
		room.Status = models.GameFinished
		if winnerSym != "" {
			winID := room.CreatorID
			if winnerSym == "O" && room.OpponentID != nil {
				winID = *room.OpponentID
			}
			room.WinnerID = &winID
			// Award points
			points := 10
			if room.Type == models.ConnectFour {
				points = 15
			}
			h.db.Model(&models.GameStats{}).Where("user_id = ? AND game_type = ?", winID, room.Type).
				Update("points", gorm.Expr("points + ?", points)).
				Update("wins", gorm.Expr("wins + ?", 1)).
				Update("total_games", gorm.Expr("total_games + ?", 1))

			lossID := room.CreatorID
			if winID == room.CreatorID && room.OpponentID != nil {
				lossID = *room.OpponentID
			}
			h.db.Model(&models.GameStats{}).Where("user_id = ? AND game_type = ?", lossID, room.Type).
				Update("losses", gorm.Expr("losses + ?", 1)).
				Update("total_games", gorm.Expr("total_games + ?", 1))
		} else {
			room.IsDraw = true
			opponentID := uint(0)
			if room.OpponentID != nil {
				opponentID = *room.OpponentID
			}
			h.db.Model(&models.GameStats{}).Where("user_id IN (?, ?) AND game_type = ?", room.CreatorID, opponentID, room.Type).
				Update("draws", gorm.Expr("draws + ?", 1)).
				Update("total_games", gorm.Expr("total_games + ?", 1))
		}
	} else {
		// Switch turn
		if userID == room.CreatorID && room.OpponentID != nil {
			room.NextTurnID = *room.OpponentID
		} else {
			room.NextTurnID = room.CreatorID
		}
	}

	h.db.Save(&room)

	// Broadcast update
	action.Type = "game_state"
	action.Payload = map[string]interface{}{
		"board":     board,
		"status":    room.Status,
		"winner_id": room.WinnerID,
		"next_turn": room.NextTurnID,
		"is_draw":   room.IsDraw,
	}
	actionJSON, _ := json.Marshal(action)
	_ = h.notifier.PublishGameAction(context.Background(), action.RoomID, string(actionJSON))
}

func (h *GameHub) handleChat(_ uint, action GameAction) {
	// Simple chat broadcast
	h.BroadcastToRoom(action.RoomID, action)
}

func (h *GameHub) sendError(userID, roomID uint, message string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, ok := h.rooms[roomID]
	if !ok {
		return
	}

	conn, ok := room[userID]
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
	_ = conn.WriteMessage(websocket.TextMessage, respJSON)
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
		for userID, conn := range users {
			shutdownMsg := GameAction{
				Type:    "server_shutdown",
				RoomID:  roomID,
				Payload: map[string]string{"message": "Server is shutting down"},
			}
			if msgJSON, err := json.Marshal(shutdownMsg); err == nil {
				if err := conn.WriteMessage(websocket.TextMessage, msgJSON); err != nil {
					log.Printf("failed to write shutdown message in room %d for user %d: %v", roomID, userID, err)
				}
			}
			if err := conn.Close(); err != nil {
				log.Printf("failed to close websocket in room %d for user %d: %v", roomID, userID, err)
			}
		}
	}

	// Clear all state
	h.rooms = make(map[uint]map[uint]*websocket.Conn)
	h.userRooms = make(map[uint]map[uint]struct{})

	return nil
}
