package notifications

import (
	"log"
	"time"

	"sanctum/internal/observability"

	"github.com/gofiber/websocket/v2"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 16384
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

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error { _ = c.Conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ReadPump Error (User %d): %v", c.UserID, err)
			}
			break
		}

		if c.IncomingHandler != nil {
			c.IncomingHandler(c, message)
		}
	}
}

// WritePump pumps messages from the hub to the websocket connection.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
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
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
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
