// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"

	"sanctum/internal/middleware"
	"sanctum/internal/models"
)

// GetUserCached demonstrates cache-aside for GET /users/:id/cached
func (s *Server) GetUserCached(c *fiber.Ctx) error {
	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}
	var user models.User

	u, err := s.userRepo.GetByID(context.Background(), id)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, models.NewInternalError(err))
	}
	// copy into dest
	user = *u
	return c.JSON(user)
}

// WebsocketHandler returns a websocket handler that registers connections with the Hub.
// Authentication is handled by route middleware and userID is read from connection locals.
func (s *Server) WebsocketHandler() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		middleware.ActiveWebSockets.Inc()
		defer middleware.ActiveWebSockets.Dec()

		userIDVal := conn.Locals("userID")
		if userIDVal == nil {
			if cerr := conn.Close(); cerr != nil {
				log.Printf("websocket close error: %v", cerr)
			}
			return
		}
		uid, ok := userIDVal.(uint)
		if !ok {
			if cerr := conn.Close(); cerr != nil {
				log.Printf("websocket close error: %v", cerr)
			}
			return
		}

		if s.hub == nil {
			_ = conn.Close()
			return
		}

		// Register connection with scaling guardrails
		client, err := s.hub.Register(uid, conn)
		if err != nil {
			log.Printf("WebSocket Notification: Failed to register user %d: %v", uid, err)
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"`+err.Error()+`"}`))
			_ = conn.Close()
			return
		}

		defer s.hub.UnregisterClient(client)

		// Presence logic
		s.notifyFriendsPresence(uid, "online")
		s.sendFriendsOnlineSnapshot(conn, uid)

		// Start pumps
		go client.WritePump()
		client.ReadPump()

		// After ReadPump returns, client is disconnected
		if !s.hub.IsOnline(uid) {
			s.notifyFriendsPresence(uid, "offline")
		}
	})
}

func (s *Server) notifyFriendsPresence(userID uint, status string) {
	if s.friendRepo == nil {
		return
	}
	friends, err := s.friendRepo.GetFriends(context.Background(), userID)
	if err != nil {
		log.Printf("failed to load friends for presence event: %v", err)
		return
	}
	user, err := s.userRepo.GetByID(context.Background(), userID)
	if err != nil {
		log.Printf("failed to load user for presence event: %v", err)
		return
	}
	for _, friend := range friends {
		s.publishUserEvent(friend.ID, EventFriendPresenceChanged, map[string]interface{}{
			"user_id":    user.ID,
			"username":   user.Username,
			"avatar":     user.Avatar,
			"status":     status,
			"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
		})
	}
}

func (s *Server) sendFriendsOnlineSnapshot(conn *websocket.Conn, userID uint) {
	if s.friendRepo == nil || s.hub == nil {
		return
	}
	friends, err := s.friendRepo.GetFriends(context.Background(), userID)
	if err != nil {
		log.Printf("failed to load friends for online snapshot: %v", err)
		return
	}
	onlineFriendIDs := make([]uint, 0, len(friends))
	for _, friend := range friends {
		if s.hub.IsOnline(friend.ID) {
			onlineFriendIDs = append(onlineFriendIDs, friend.ID)
		}
	}
	msg, err := json.Marshal(map[string]interface{}{
		"type": "friends_online_snapshot",
		"payload": map[string]interface{}{
			"user_ids": onlineFriendIDs,
		},
	})
	if err != nil {
		log.Printf("failed to marshal friends online snapshot: %v", err)
		return
	}
	if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
		log.Printf("failed to write friends online snapshot: %v", err)
	}
}
