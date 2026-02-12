package server

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	"sanctum/internal/middleware"
	"sanctum/internal/models"
	"sanctum/internal/notifications"
	"sanctum/internal/service"

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
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	var req struct {
		Type models.GameType `json:"type"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid request body"))
	}

	room, created, err := s.gameSvc().CreateGameRoom(ctx, userID, req.Type)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if !created {
		return c.Status(fiber.StatusOK).JSON(room)
	}
	return c.Status(fiber.StatusCreated).JSON(room)
}

// GetActiveGameRooms returns pending rooms for a game type
func (s *Server) GetActiveGameRooms(c *fiber.Ctx) error {
	ctx := c.UserContext()
	gameType := c.Query("type")

	var requestedType *models.GameType
	if gameType != "" {
		gt := models.GameType(gameType)
		requestedType = &gt
	}

	rooms, err := s.gameSvc().GetActiveGameRooms(ctx, requestedType)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	return c.JSON(rooms)
}

// GetGameStats fetches stats for a user and game type
func (s *Server) GetGameStats(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	gameType := models.GameType(c.Params("type"))

	stats, err := s.gameSvc().GetGameStats(ctx, userID, gameType)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(stats)
}

// GetGameRoom fetches a specific game room
func (s *Server) GetGameRoom(c *fiber.Ctx) error {
	ctx := c.UserContext()
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	room, err := s.gameSvc().GetGameRoom(ctx, roomID)
	if err != nil {
		status := fiber.StatusInternalServerError
		if appErr, ok := err.(*models.AppError); ok && appErr.Code == "NOT_FOUND" {
			status = fiber.StatusNotFound
		}
		return models.RespondWithError(c, status, err)
	}

	return c.JSON(room)
}

// LeaveGameRoom explicitly leaves/cancels a room for the current user.
func (s *Server) LeaveGameRoom(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	roomID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	room, alreadyClosed, err := s.gameSvc().LeaveGameRoom(ctx, userID, roomID)
	if err != nil {
		status := fiber.StatusInternalServerError
		if appErr, ok := err.(*models.AppError); ok {
			switch appErr.Code {
			case "NOT_FOUND":
				status = fiber.StatusNotFound
			case "FORBIDDEN":
				status = fiber.StatusForbidden
			}
		}
		return models.RespondWithError(c, status, err)
	}

	if !alreadyClosed && room.Status == models.GameCancelled && s.notifier != nil {
		_ = s.notifier.PublishGameAction(context.Background(), room.ID, `{"type":"game_cancelled","payload":{"message":"A player left the room"}}`)
	}
	message := "Room closed"
	if alreadyClosed {
		message = "Room already closed"
	}
	return c.JSON(fiber.Map{"message": message, "status": room.Status})
}

// WebSocketGameHandler handles real-time game coordination
func (s *Server) WebSocketGameHandler() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		middleware.ActiveWebSockets.Inc()
		defer middleware.ActiveWebSockets.Dec()

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

		// Create a Client for serialized writes and hub registration
		client := notifications.NewClient(s.gameHub, c, userID)

		// Register connection with GameHub
		if err := s.gameHub.RegisterClient(roomID, client); err != nil {
			log.Printf("GameWS: Registration failed: %v", err)
			_ = c.WriteJSON(notifications.GameAction{
				Type:    "error",
				RoomID:  roomID,
				Payload: map[string]string{"message": err.Error()},
			})
			_ = c.Close()
			return
		}
		defer func() {
			s.gameHub.UnregisterClient(client)
			_ = c.Close()
		}()

		// Set incoming handler for game actions
		client.IncomingHandler = func(_ *notifications.Client, msg []byte) {
			var action notifications.GameAction
			if err := json.Unmarshal(msg, &action); err != nil {
				log.Printf("GameWS: Failed to unmarshal action: %v", err)
				return
			}

			action.UserID = userID
			action.RoomID = roomID

			// Handle the action through the hub
			s.gameHub.HandleAction(userID, action)
		}

		// Launch write pump for serialized writes
		go client.WritePump()

		// Read pump (blocks until disconnect)
		client.ReadPump()
	})
}

func (s *Server) gameSvc() *service.GameService {
	return service.NewGameService(s.gameRepo)
}
