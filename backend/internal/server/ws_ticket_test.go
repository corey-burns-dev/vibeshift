package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"sanctum/internal/config"

	"github.com/alicebob/miniredis/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
)

func TestAuthRequired_WSTicket(t *testing.T) {
	// Setup miniredis
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	// Setup Redis client
	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	// Setup Server with in-process ticket cache
	s := &Server{
		config:          &config.Config{JWTSecret: "test-secret"},
		redis:           rdb,
		consumedTickets: make(map[string]consumedTicketEntry),
	}

	app := fiber.New()

	// Define a WS route and a regular route both using AuthRequired
	app.Get("/api/ws/test", s.AuthRequired(), func(c *fiber.Ctx) error {
		userID := c.Locals("userID")
		wsTicket := c.Locals("wsTicket")
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"userID":   userID,
			"wsTicket": wsTicket,
		})
	})

	app.Get("/api/other", s.AuthRequired(), func(c *fiber.Ctx) error {
		userID := c.Locals("userID")
		wsTicket := c.Locals("wsTicket")
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"userID":   userID,
			"wsTicket": wsTicket,
		})
	})

	ctx := context.Background()

	t.Run("WS Path - Ticket consumed from Redis but cached in-process", func(t *testing.T) {
		ticket := "ws-test-ticket-1"
		userID := "123"
		key := fmt.Sprintf("ws_ticket:%s", ticket)

		// Set ticket in Redis
		err := rdb.Set(ctx, key, userID, time.Minute).Err()
		assert.NoError(t, err)

		// Request WS path
		req := httptest.NewRequest(http.MethodGet, "/api/ws/test?ticket="+ticket, nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		// Ticket is NOW consumed from Redis (GETDEL used atomically)
		exists, err := rdb.Exists(ctx, key).Result()
		assert.NoError(t, err)
		assert.Equal(t, int64(0), exists, "Ticket should be consumed from Redis via GETDEL")

		// But it's cached in-process for multi-pass handshake
		s.consumedTicketsMu.Lock()
		_, inCache := s.consumedTickets[ticket]
		s.consumedTicketsMu.Unlock()
		assert.True(t, inCache, "Ticket should be cached in-process after GETDEL")

		// Verify locals
		var body map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		assert.Equal(t, float64(123), body["userID"])
		assert.Equal(t, ticket, body["wsTicket"])
		_ = resp.Body.Close()
	})

	t.Run("WS Path - Second pass uses in-process cache", func(t *testing.T) {
		ticket := "ws-test-ticket-2"
		userID := "789"
		key := fmt.Sprintf("ws_ticket:%s", ticket)

		// Set ticket in Redis
		err := rdb.Set(ctx, key, userID, time.Minute).Err()
		assert.NoError(t, err)

		// First pass -- consumes from Redis
		req := httptest.NewRequest(http.MethodGet, "/api/ws/test?ticket="+ticket, nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		_ = resp.Body.Close()

		// Second pass -- ticket is gone from Redis but in-process cache should work
		req2 := httptest.NewRequest(http.MethodGet, "/api/ws/test?ticket="+ticket, nil)
		resp2, err := app.Test(req2)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp2.StatusCode, "Second pass should succeed via in-process cache")

		var body map[string]interface{}
		_ = json.NewDecoder(resp2.Body).Decode(&body)
		assert.Equal(t, float64(789), body["userID"])
		_ = resp2.Body.Close()
	})

	t.Run("Non-WS Path - Ticket SHOULD be consumed by middleware", func(t *testing.T) {
		ticket := "other-test-ticket-1"
		userID := "456"
		key := fmt.Sprintf("ws_ticket:%s", ticket)

		// Set ticket in Redis
		err := rdb.Set(ctx, key, userID, time.Minute).Err()
		assert.NoError(t, err)

		// Request non-WS path
		req := httptest.NewRequest(http.MethodGet, "/api/other?ticket="+ticket, nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		// Verify ticket is GONE from Redis (atomic GetDel)
		exists, err := rdb.Exists(ctx, key).Result()
		assert.NoError(t, err)
		assert.Equal(t, int64(0), exists, "Ticket should be consumed for non-WS path by middleware")
		_ = resp.Body.Close()
	})

	t.Run("Invalid Ticket - WS Path returns 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/ws/test?ticket=invalid", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		_ = resp.Body.Close()
	})
}

func TestServer_ConsumeWSTicket(t *testing.T) {
	s := &Server{
		consumedTickets: make(map[string]consumedTicketEntry),
	}
	ctx := context.Background()

	t.Run("Consume valid ticket removes from in-process cache", func(t *testing.T) {
		ticket := "consume-me"
		// Pre-populate the in-process cache (simulating what GETDEL + cache does)
		s.consumedTicketsMu.Lock()
		s.consumedTickets[ticket] = consumedTicketEntry{userID: 123, consumeAt: time.Now()}
		s.consumedTicketsMu.Unlock()

		s.consumeWSTicket(ctx, ticket)

		s.consumedTicketsMu.Lock()
		_, exists := s.consumedTickets[ticket]
		s.consumedTicketsMu.Unlock()
		assert.False(t, exists, "Ticket should be removed from in-process cache")
	})

	t.Run("Consume nil ticket - noop", func(_ *testing.T) {
		s.consumeWSTicket(ctx, nil)
	})

	t.Run("Consume empty ticket - noop", func(_ *testing.T) {
		s.consumeWSTicket(ctx, "")
	})
}
