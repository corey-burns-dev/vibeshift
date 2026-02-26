package notifications

import (
	"log"
	"time"

	"sanctum/internal/observability"

	"github.com/gofiber/websocket/v2"
)

var (
	// WriteWait is the time allowed to write a message to the peer.
	// 15s gives enough headroom for production network latency while still
	// detecting truly dead connections within a reasonable window.
	// (Previously 3s, which was too aggressive for any non-local path.)
	WriteWait = 15 * time.Second

	// PongWait is the time allowed to read the next pong message from the peer (shortened to target ~10s offline detection).
	PongWait = 10 * time.Second

	// PingPeriod is the period for sending pings to the peer; must be less than PongWait.
	PingPeriod = 3 * time.Second

	// MaxMessageSize is the maximum message size allowed from the peer.
	MaxMessageSize = 16384
)

// WSHub is an interface for hubs that manage generic clients
type WSHub interface {
	UnregisterClient(c *Client)
	Name() string
}

// Client is a generic middleman between the websocket connection and a hub.
type Client struct {
	Hub WSHub

	// The websocket connection.
	Conn *websocket.Conn

	// Buffered channel of outbound messages.
	Send chan []byte

	// UserID for this client
	UserID uint

	// Callback for handling incoming messages
	IncomingHandler func(*Client, []byte)

	// OnActivity is invoked whenever client activity indicates the connection is alive
	// (incoming message or pong heartbeat).
	OnActivity func(userID uint)
}

// NewClient creates a new Client instance
func NewClient(hub WSHub, conn *websocket.Conn, userID uint) *Client {
	return &Client{
		Hub:    hub,
		Conn:   conn,
		UserID: userID,
		Send:   make(chan []byte, 256),
	}
}

// ReadPump pumps messages from the websocket connection to the hub.
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.UnregisterClient(c)
		_ = c.Conn.Close()
	}()

	c.Conn.SetReadLimit(int64(MaxMessageSize))
	_ = c.Conn.SetReadDeadline(time.Now().Add(PongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(PongWait))
		if c.OnActivity != nil {
			c.OnActivity(c.UserID)
		}
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ReadPump Error (User %d): %v", c.UserID, err)
			}
			break
		}

		if c.OnActivity != nil {
			c.OnActivity(c.UserID)
		}

		if c.IncomingHandler != nil {
			c.IncomingHandler(c, message)
		}
	}
}

// WritePump pumps messages from the hub to the websocket connection.
func (c *Client) WritePump() {
	ticker := time.NewTicker(PingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(WriteWait))
			if !ok {
				// The hub closed the channel.
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(WriteWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// TrySend attempts to send a message to the client, handling closed channels and full buffers
func (c *Client) TrySend(message []byte) {
	defer func() {
		if r := recover(); r != nil {
			observability.WebSocketBackpressureDrops.WithLabelValues(c.Hub.Name(), "closed").Inc()
		}
	}()

	select {
	case c.Send <- message:
	default:
		// Buffer full, drop message and notify client so it can re-fetch
		observability.WebSocketBackpressureDrops.WithLabelValues(c.Hub.Name(), "full").Inc()
		log.Printf("Client %d (%s): Buffer full, dropped message", c.UserID, c.Hub.Name())

		// Best-effort notification to the client that messages were dropped.
		// This allows the frontend to detect the gap and re-fetch.
		dropNotice := []byte(`{"type":"messages_dropped","payload":{"reason":"buffer_full"}}`)
		select {
		case c.Send <- dropNotice:
		default:
			// Can't even send the notification -- client is truly overwhelmed
		}
	}
}
