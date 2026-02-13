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

	// Setup Server
	s := &Server{
		config: &config.Config{JWTSecret: "test-secret"},
		redis:  rdb,
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

	t.Run("WS Path - Ticket should NOT be consumed by middleware", func(t *testing.T) {
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

		// Verify ticket STILL EXISTS in Redis
		exists, err := rdb.Exists(ctx, key).Result()
		assert.NoError(t, err)
		assert.Equal(t, int64(1), exists, "Ticket should still exist for WS path after middleware")

		// Verify locals
		var body map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		assert.Equal(t, float64(123), body["userID"])
		assert.Equal(t, ticket, body["wsTicket"])
		_ = resp.Body.Close()
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
	mr, _ := miniredis.Run()
	defer mr.Close()
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	s := &Server{redis: rdb}
	ctx := context.Background()

	t.Run("Consume valid ticket", func(t *testing.T) {
		ticket := "consume-me"
		key := "ws_ticket:" + ticket
		rdb.Set(ctx, key, "123", time.Minute)

		s.consumeWSTicket(ctx, ticket)

		exists, _ := rdb.Exists(ctx, key).Result()
		assert.Equal(t, int64(0), exists)
	})

	t.Run("Consume nil ticket - noop", func(t *testing.T) {
		s.consumeWSTicket(ctx, nil)
	})

	t.Run("Consume empty ticket - noop", func(t *testing.T) {
		s.consumeWSTicket(ctx, "")
	})
}
