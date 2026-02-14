package server

import (
	"context"
	"encoding/json"
	"log"

	"sanctum/internal/middleware"
	"sanctum/internal/notifications"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

/*
const (
	// videoChatPingInterval is how often the server pings idle connections
	videoChatPingInterval = 30 * time.Second
	// videoChatPongTimeout is how long to wait for a pong before considering the peer dead
	videoChatPongTimeout = 40 * time.Second
	// videoChatMaxMessageSize allows for large SDP payloads
	videoChatMaxMessageSize = 16384
)
*/

// WebSocketVideoChatHandler handles WebSocket connections for WebRTC video chat signaling.
// It authenticates via JWT, then manages join/leave/offer/answer/ice-candidate messages
// to coordinate peer-to-peer connections between users in a room.
func (s *Server) WebSocketVideoChatHandler() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		middleware.ActiveWebSockets.Inc()
		defer middleware.ActiveWebSockets.Dec()

		// Get userID from context locals (set by AuthRequired middleware)
		userIDVal := conn.Locals("userID")
		if userIDVal == nil {
			log.Printf("VideoChat WS: Unauthenticated connection attempt")
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"unauthorized"}}`))
			_ = conn.Close()
			return
		}
		userID := userIDVal.(uint)

		// Get user info for username
		user, err := s.userRepo.GetByID(context.Background(), userID)
		if err != nil {
			log.Printf("VideoChat WS: Failed to get user %d: %v", userID, err)
			_ = conn.Close()
			return
		}
		username := user.Username

		// Room ID from query parameter
		roomID := conn.Query("room")
		if roomID == "" {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"room parameter required"}}`))
			_ = conn.Close()
			return
		}

		log.Printf("VideoChat WS: User %d (%s) connecting to room %s", userID, username, roomID)

		if s.videoChatHub == nil {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"video chat not available"}}`))
			_ = conn.Close()
			return
		}

		// Register the client
		client, err := s.videoChatHub.Register(roomID, userID, conn)
		if err != nil {
			log.Printf("VideoChat WS: Failed to register user %d: %v", userID, err)
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"`+err.Error()+`"}}`))
			_ = conn.Close()
			return
		}

		// Ensure cleanup on disconnect - cleanup is performed by client.ReadPump's defer

		// Notify others of the new joiner and send room state to the joiner
		s.videoChatHub.BroadcastJoin(roomID, userID, username)

		client.IncomingHandler = func(c *notifications.Client, message []byte) {
			var signal notifications.VideoChatSignal
			if err := json.Unmarshal(message, &signal); err != nil {
				log.Printf("VideoChat WS: Invalid message from user %d: %v", userID, err)
				return
			}

			signal.UserID = userID
			signal.Username = username
			signal.RoomID = roomID

			switch signal.Type {
			case "offer", "answer", "ice-candidate":
				if signal.TargetID == 0 {
					log.Printf("VideoChat WS: %s from user %d missing target_id", signal.Type, userID)
					return
				}
				s.videoChatHub.Relay(roomID, userID, signal.TargetID, signal)

			case "leave":
				// Explicit leave handled by ReadPump closing
				_ = c.Conn.Close()

			default:
				log.Printf("VideoChat WS: Unknown signal type %q from user %d", signal.Type, userID)
			}
		}

		go client.WritePump()
		client.ReadPump()
	})
}
