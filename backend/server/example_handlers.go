// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"log"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"

	"vibeshift/models"
)

// GetUserCached demonstrates cache-aside for GET /users/:id/cached
func (s *Server) GetUserCached(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id64, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("invalid user id"))
	}
	var user models.User

	u, err := s.userRepo.GetByID(context.Background(), uint(id64))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, models.NewInternalError(err))
	}
	// copy into dest
	user = *u
	return c.JSON(user)
}

// WebsocketHandler returns a websocket handler that registers connections with the Hub.
// Clients should connect and send an initial auth message: "user:<id>"
func (s *Server) WebsocketHandler() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		// Expect the client to send an auth message first in the form: "user:<id>"
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if cerr := conn.Close(); cerr != nil {
				log.Printf("websocket read auth error, close failed: %v", cerr)
			}
			return
		}
		txt := string(msg)
		if !strings.HasPrefix(txt, "user:") {
			if werr := conn.WriteMessage(websocket.TextMessage, []byte("first message must be auth: user:<id>")); werr != nil {
				log.Printf("websocket write error: %v", werr)
			}
			if cerr := conn.Close(); cerr != nil {
				log.Printf("websocket close error: %v", cerr)
			}
			return
		}
		idStr := strings.TrimPrefix(txt, "user:")
		id64, err := strconv.ParseUint(idStr, 10, 32)
		if err != nil {
			if werr := conn.WriteMessage(websocket.TextMessage, []byte("invalid user id")); werr != nil {
				log.Printf("websocket write error: %v", werr)
			}
			if cerr := conn.Close(); cerr != nil {
				log.Printf("websocket close error: %v", cerr)
			}
			return
		}
		uid := uint(id64)

		// Register connection
		if s.hub != nil {
			s.hub.Register(uid, conn)
			defer s.hub.Unregister(uid, conn)
		}

		// Read loop (publish messages to user's notification channel)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}
			if s.notifier != nil {
				if perr := s.notifier.PublishUser(context.Background(), uid, string(msg)); perr != nil {
					log.Printf("failed to publish user message: %v", perr)
				}
			}
		}
	})
}
