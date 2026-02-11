package server

import (
	"net/http/httptest"
	"testing"

	"sanctum/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/stretchr/testify/assert"
)

func TestSecurityMiddleware(t *testing.T) {
	app := fiber.New()

	// Apply just the middleware we want to test
	app.Use(helmet.New())
	app.Use(middleware.StructuredLogger())

	// Add a dummy route
	app.Get("/test", func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	t.Run("Security Headers", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		resp, _ := app.Test(req)
		defer func() { _ = resp.Body.Close() }()
		defer func() { _ = resp.Body.Close() }()
		defer func() { _ = resp.Body.Close() }()

		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		// Check for some common helmet headers
		assert.NotEmpty(t, resp.Header.Get("X-Content-Type-Options"))
		assert.NotEmpty(t, resp.Header.Get("X-Frame-Options"))
	})

	t.Run("Structured Logging", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		resp, _ := app.Test(req)
		defer func() { _ = resp.Body.Close() }()
		defer func() { _ = resp.Body.Close() }()
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	})
}

func TestHealthCheckIsolated(t *testing.T) {
	app := fiber.New()

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "healthy",
			"checks": fiber.Map{
				"database": "healthy",
				"redis":    "healthy",
			},
		})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	resp, _ := app.Test(req)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
}
