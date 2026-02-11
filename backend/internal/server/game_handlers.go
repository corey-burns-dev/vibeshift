package server

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/notifications"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

const pendingRoomMaxIdle = 10 * time.Minute

func isPendingRoomStale(room models.GameRoom, now time.Time) bool {
	if room.Status != models.GamePending {
		return false
	}
	return now.Sub(room.UpdatedAt) > pendingRoomMaxIdle
}

// CreateGameRoom handles the creation of a new game room
func (s *Server) CreateGameRoom(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	var req struct {
		Type models.GameType `json:"type"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid request body"))
	}

	// Prevent Room Bloat: Check for existing pending rooms for this user
	existingRooms, _ := s.gameRepo.GetActiveRooms(req.Type)
	now := time.Now()
	for _, r := range existingRooms {
		if r.CreatorID == userID {
			if isPendingRoomStale(r, now) {
				r.Status = models.GameCancelled
				r.OpponentID = nil
				r.WinnerID = nil
				r.NextTurnID = 0
				if err := s.gameRepo.UpdateRoom(&r); err != nil {
					log.Printf("failed to auto-cancel stale room %d: %v", r.ID, err)
				}
				continue
			}

			// If already has a pending room, return it instead of creating a new one
			return c.Status(fiber.StatusOK).JSON(r)
		}
	}

	room := &models.GameRoom{
		Type:          req.Type,
		Status:        models.GamePending,
		CreatorID:     userID,
		CurrentState:  "{}",
		Configuration: "{}",
	}

	if err := s.gameRepo.CreateRoom(room); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, models.NewInternalError(err))
	}

	return c.Status(fiber.StatusCreated).JSON(room)
}

// GetActiveGameRooms returns pending rooms for a game type
func (s *Server) GetActiveGameRooms(c *fiber.Ctx) error {
	gameType := c.Query("type")
	var (
		rooms []models.GameRoom
		err   error
	)

	if gameType == "" {
		rooms, err = s.gameRepo.GetAllActiveRooms()
	} else {
		rooms, err = s.gameRepo.GetActiveRooms(models.GameType(gameType))
	}

	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, models.NewInternalError(err))
	}

	now := time.Now()
	filteredRooms := make([]models.GameRoom, 0, len(rooms))
	for _, room := range rooms {
		if isPendingRoomStale(room, now) {
			room.Status = models.GameCancelled
			room.OpponentID = nil
			room.WinnerID = nil
			room.NextTurnID = 0
			if updateErr := s.gameRepo.UpdateRoom(&room); updateErr != nil {
				log.Printf("failed to auto-cancel stale room %d: %v", room.ID, updateErr)
			}
			continue
		}
		filteredRooms = append(filteredRooms, room)
	}

	return c.JSON(filteredRooms)
}

// GetGameStats fetches stats for a user and game type
func (s *Server) GetGameStats(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	gameType := models.GameType(c.Params("type"))

	stats, err := s.gameRepo.GetStats(userID, gameType)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, models.NewInternalError(err))
	}

	return c.JSON(stats)
}

// GetGameRoom fetches a specific game room
func (s *Server) GetGameRoom(c *fiber.Ctx) error {
	id, _ := strconv.ParseUint(c.Params("id"), 10, 32)
	room, err := s.gameRepo.GetRoom(uint(id))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("GameRoom", id))
	}

	return c.JSON(room)
}

// LeaveGameRoom explicitly leaves/cancels a room for the current user.
func (s *Server) LeaveGameRoom(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	id, err := strconv.ParseUint(c.Params("id"), 10, 32)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid room id"))
	}

	room, err := s.gameRepo.GetRoom(uint(id))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, models.NewNotFoundError("GameRoom", id))
	}

	isCreator := room.CreatorID == userID
	isOpponent := room.OpponentID != nil && *room.OpponentID == userID
	if !isCreator && !isOpponent {
		return models.RespondWithError(c, fiber.StatusForbidden, models.NewForbiddenError("Not a participant in this room"))
	}

	if room.Status == models.GameFinished || room.Status == models.GameCancelled {
		return c.JSON(fiber.Map{"message": "Room already closed", "status": room.Status})
	}

	// Deterministic cleanup policy:
	// - pending rooms: cancel outright
	// - active rooms: mark cancelled when any participant leaves
	room.Status = models.GameCancelled
	room.OpponentID = nil
	room.WinnerID = nil
	room.NextTurnID = 0

	if err := s.gameRepo.UpdateRoom(room); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, models.NewInternalError(err))
	}

	if s.notifier != nil {
		_ = s.notifier.PublishGameAction(context.Background(), room.ID, `{"type":"game_cancelled","payload":{"message":"A player left the room"}}`)
	}

	return c.JSON(fiber.Map{"message": "Room closed", "status": room.Status})
}

// WebSocketGameHandler handles real-time game coordination
func (s *Server) WebSocketGameHandler() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		userIDVal := c.Locals("userID")
		if userIDVal == nil {
			log.Println("GameWS: No userID in locals")
			_ = c.Close()
			return
		}
		userID := userIDVal.(uint)

		roomIDStr := c.Query("room_id")
		if roomIDStr == "" {
			log.Println("GameWS: No room_id in query")
			_ = c.Close()
			return
		}
		roomID64, _ := strconv.ParseUint(roomIDStr, 10, 32)
		roomID := uint(roomID64)

		// Register connection with GameHub
		s.gameHub.Register(userID, roomID, c)

		defer func() {
			s.gameHub.Unregister(userID, roomID, c)
			_ = c.Close()
		}()

		// Subscribe to Redis game room notifications
		ctx := context.Background()
		redisSub := s.redis.Subscribe(ctx, notifications.GameRoomChannel(roomID))
		defer func() {
			_ = redisSub.Close()
		}()

		// Channel to handle Redis messages
		redisChan := redisSub.Channel()

		// Launch goroutine to listen for Redis messages and forward to WebSocket
		go func() {
			for redisMsg := range redisChan {
				if err := c.WriteMessage(websocket.TextMessage, []byte(redisMsg.Payload)); err != nil {
					log.Printf("GameWS: Error writing Redis message to user %d: %v", userID, err)
					return
				}
			}
		}()

		// Read loop
		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				log.Printf("GameWS: Error reading message (User %d, Room %d): %v", userID, roomID, err)
				break
			}

			var action notifications.GameAction
			if err := json.Unmarshal(msg, &action); err != nil {
				log.Printf("GameWS: Failed to unmarshal action: %v", err)
				continue
			}

			action.UserID = userID
			action.RoomID = roomID

			// Handle the action through the hub
			s.gameHub.HandleAction(userID, action)
		}
	})
}
