package server

import (
	"encoding/json"
	"log"
	"time"

	"vibeshift/internal/notifications"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

const (
	// videoChatPingInterval is how often the server pings idle connections
	videoChatPingInterval = 30 * time.Second
	// videoChatPongTimeout is how long to wait for a pong before considering the peer dead
	videoChatPongTimeout = 40 * time.Second
	// videoChatMaxMessageSize allows for large SDP payloads
	videoChatMaxMessageSize = 16384
)

// WebSocketVideoChatHandler handles WebSocket connections for WebRTC video chat signaling.
// It authenticates via JWT, then manages join/leave/offer/answer/ice-candidate messages
// to coordinate peer-to-peer connections between users in a room.
func (s *Server) WebSocketVideoChatHandler() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		// Authenticate via query parameter
		token := conn.Query("token")
		if token == "" {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"token required"}}`))
			_ = conn.Close()
			return
		}

		userID, username, err := s.validateChatToken(token)
		if err != nil {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"invalid token"}}`))
			_ = conn.Close()
			return
		}

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

		// Join the room
		s.videoChatHub.Join(roomID, userID, username, conn)

		// Ensure cleanup on disconnect
		defer s.videoChatHub.Leave(roomID, userID)

		// Configure read limits and pong handler for heartbeat
		conn.SetReadLimit(videoChatMaxMessageSize)
		_ = conn.SetReadDeadline(time.Now().Add(videoChatPongTimeout))
		conn.SetPongHandler(func(string) error {
			return conn.SetReadDeadline(time.Now().Add(videoChatPongTimeout))
		})

		// Start ping ticker to detect dead connections
		pingTicker := time.NewTicker(videoChatPingInterval)
		defer pingTicker.Stop()

		go func() {
			for range pingTicker.C {
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}()

		// Read loop — relay signaling messages
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("VideoChat WS: Unexpected close from user %d: %v", userID, err)
				}
				break
			}

			var signal notifications.VideoChatSignal
			if err := json.Unmarshal(message, &signal); err != nil {
				log.Printf("VideoChat WS: Invalid message from user %d: %v", userID, err)
				continue
			}

			signal.UserID = userID
			signal.Username = username
			signal.RoomID = roomID

			switch signal.Type {
			case "offer", "answer", "ice-candidate":
				// These are targeted — relay to the specific peer
				if signal.TargetID == 0 {
					log.Printf("VideoChat WS: %s from user %d missing target_id", signal.Type, userID)
					continue
				}
				s.videoChatHub.Relay(roomID, userID, signal.TargetID, signal)

			case "leave":
				// Explicit leave (before disconnect) — defer handles cleanup
				return

			default:
				log.Printf("VideoChat WS: Unknown signal type %q from user %d", signal.Type, userID)
			}
		}
	})
}
