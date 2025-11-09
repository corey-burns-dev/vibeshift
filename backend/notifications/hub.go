package notifications

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/gofiber/websocket/v2"
)

// Hub is a minimal websocket hub that maps userID -> list of websocket connections.
// It listens for Redis pub/sub messages (via Notifier) and fans them out to connected clients.
type Hub struct {
	mu    sync.RWMutex
	conns map[uint]map[*websocket.Conn]struct{}
}

func NewHub() *Hub {
	return &Hub{conns: make(map[uint]map[*websocket.Conn]struct{})}
}

// Register a connection for a given userID
func (h *Hub) Register(userID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	m, ok := h.conns[userID]
	if !ok {
		m = make(map[*websocket.Conn]struct{})
		h.conns[userID] = m
	}
	m[conn] = struct{}{}
}

// Unregister removes a connection
func (h *Hub) Unregister(userID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.conns[userID]; ok {
		delete(m, conn)
		if len(m) == 0 {
			delete(h.conns, userID)
		}
	}
}

// Broadcast sends message to all connections for userID
func (h *Hub) Broadcast(userID uint, message string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if conns, ok := h.conns[userID]; ok {
		for c := range conns {
			if err := c.WriteMessage(websocket.TextMessage, []byte(message)); err != nil {
				log.Printf("websocket write error: %v", err)
			}
		}
	}
}

// StartWiring connects the Notifier to this hub: it subscribes to Redis pattern and
// forwards messages to matching userID connections.
func (h *Hub) StartWiring(ctx context.Context, n *Notifier) error {
	return n.StartPatternSubscriber(ctx, func(channel, payload string) {
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
