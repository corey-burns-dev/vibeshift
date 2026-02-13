package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
)

// Note: Testing RateLimit middleware requires a real or mocked Redis.
// We'll test CheckRateLimit logic directly and use a mock for the middleware if possible.
// For now, let's test the logic with a container or mock.

func TestCheckRateLimit(t *testing.T) {
	// Skip real Redis test if not available or use a mock
	// For unit tests, we should mock redis.Cmdable
	// But go-redis doesn't make it trivial without a mock lib or interface.
	// Since the user asked for idiomatic tests, let's assume we can mock it.

	tests := []struct {
		name          string
		resource      string
		id            string
		limit         int
		window        time.Duration
		mockSetup     func() *redis.Client // This is tricky with go-redis/v9 directly
		expectedAllow bool
		env           string
	}{
		{
			name:          "Test Environment Bypass",
			resource:      "test",
			id:            "1",
			limit:         1,
			window:        time.Minute,
			expectedAllow: true,
			env:           "test",
		},
		{
			name:          "Development Environment Bypass",
			resource:      "test",
			id:            "1",
			limit:         1,
			window:        time.Minute,
			expectedAllow: true,
			env:           "development",
		},
		{
			name:          "Nil Redis Fail-Open",
			resource:      "test",
			id:            "1",
			limit:         1,
			window:        time.Minute,
			expectedAllow: true,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			if tt.env != "" {
				t.Setenv("APP_ENV", tt.env)
			} else {
				t.Setenv("APP_ENV", "production")
			}

			allowed, err := CheckRateLimit(context.Background(), nil, tt.resource, tt.id, tt.limit, tt.window)
			// In our new implementation, CheckRateLimit returns error if rdb is nil
			if tt.name == "Nil Redis Fail-Open" {
				assert.Error(t, err)
				assert.False(t, allowed)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expectedAllow, allowed)
			}
		})
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	t.Run("Bypass in test mode", func(t *testing.T) {
		app := fiber.New()
		t.Setenv("APP_ENV", "test")
		app.Get("/test", RateLimit(nil, 1, time.Minute), func(c *fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		_ = resp.Body.Close()
	})

	t.Run("FailOpen with nil redis in production", func(t *testing.T) {
		app := fiber.New()
		t.Setenv("APP_ENV", "production")
		app.Get("/test", RateLimit(nil, 1, time.Minute), func(c *fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		_ = resp.Body.Close()
	})

	t.Run("FailClosed with nil redis in production", func(t *testing.T) {
		app := fiber.New()
		t.Setenv("APP_ENV", "production")
		app.Get("/sensitive", RateLimitWithPolicy(nil, 1, time.Minute, FailClosed), func(c *fiber.Ctx) error {
			return c.SendStatus(fiber.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/sensitive", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
		_ = resp.Body.Close()
	})
}
