// Package notifications provides real-time notification delivery and management.
package notifications

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/gofiber/websocket/v2"
)

const (
	// Max connections per user
	maxConnsPerUser = 5
	// Max total connections
	maxTotalConns = 10000
)

// Hub is a websocket hub that maps userID -> list of Clients.
type Hub struct {
	mu         sync.RWMutex
	conns      map[uint]map[*Client]struct{}
	totalConns int
	shutdown   chan struct{}
	done       chan struct{}
}

// Name returns a human-readable identifier for this hub.
func (h *Hub) Name() string { return "notification hub" }

// NewHub creates a new Hub instance for managing notifications.
func (h *Hub) UnregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.conns[client.UserID]; ok {
		if _, exists := m[client]; exists {
			delete(m, client)
			h.totalConns--
		}
		if len(m) == 0 {
			delete(h.conns, client.UserID)
		}
	}
}

// Register a connection for a given userID. Returns the Client or error if limits exceeded.
func (h *Hub) Register(userID uint, conn *websocket.Conn) (*Client, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.totalConns >= maxTotalConns {
		return nil, errors.New("server connection limit reached")
	}

	m, ok := h.conns[userID]
	if !ok {
		m = make(map[*Client]struct{})
		h.conns[userID] = m
	}

	if len(m) >= maxConnsPerUser {
		return nil, errors.New("user connection limit reached")
	}

	client := NewClient(h, conn, userID)

	m[client] = struct{}{}
	h.totalConns++

	return client, nil
}

// NewHub creates a new Hub instance for managing notifications.
func NewHub() *Hub {
	return &Hub{
		conns:    make(map[uint]map[*Client]struct{}),
		shutdown: make(chan struct{}),
		done:     make(chan struct{}),
	}
}

// Broadcast sends message to all connections for userID
func (h *Hub) Broadcast(userID uint, message string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if clients, ok := h.conns[userID]; ok {
		data := []byte(message)
		for c := range clients {
			select {
			case c.Send <- data:
			default:
				// Backpressure: Drop message if buffer full to avoid blocking the hub
				log.Printf("Backpressure: dropping message for user %d (buffer full)", userID)
			}
		}
	}
}

// IsOnline reports whether a user currently has at least one active websocket connection.
func (h *Hub) IsOnline(userID uint) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	clients, ok := h.conns[userID]
	return ok && len(clients) > 0
}

// BroadcastAll sends message to every connected websocket client.
func (h *Hub) BroadcastAll(message string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	data := []byte(message)
	for _, clients := range h.conns {
		for c := range clients {
			select {
			case c.Send <- data:
			default:
				// Backpressure
			}
		}
	}
}

// StartWiring connects the Notifier to this hub: it subscribes to Redis pattern and
// forwards messages to matching userID connections.
func (h *Hub) StartWiring(ctx context.Context, n *Notifier) error {
	return n.StartPatternSubscriber(ctx, func(channel, payload string) {
		if channel == "notifications:broadcast" {
			h.BroadcastAll(payload)
			return
		}
		if !strings.HasPrefix(channel, "notifications:user:") {
			log.Printf("invalid notification channel: %s", channel)
			return
		}
		// channel form: notifications:user:<id>
		var userID uint
		// simple parse
		_, err := fmt.Sscanf(channel, "notifications:user:%d", &userID)
		if err != nil {
			log.Printf("invalid notification channel: %s", channel)
			return
		}
		h.Broadcast(userID, payload)
	})
}

// Shutdown gracefully closes all websocket connections
func (h *Hub) Shutdown(_ context.Context) error {
	close(h.shutdown)

	// Close all connections gracefully
	h.mu.Lock()
	for userID, userConns := range h.conns {
		for client := range userConns {
			// Send close message to client
			if err := client.Conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseGoingAway, "Server shutting down")); err != nil {
				log.Printf("failed to write close message for user %d: %v", userID, err)
			}
			// Close the connection
			if err := client.Conn.Close(); err != nil {
				log.Printf("failed to close websocket for user %d: %v", userID, err)
			}
		}
	}
	// Clear all connections
	h.conns = make(map[uint]map[*Client]struct{})
	h.mu.Unlock()

	// Signal completion
	close(h.done)

	return nil
}
