package server

import (
	"net/http"
	"net/http/httptest"
	"sanctum/internal/config"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetupMiddleware_RateLimitedResponseIncludesCORSHeaders(t *testing.T) {
	srv := &Server{
		config: &config.Config{
			AllowedOrigins: "http://localhost:5173",
		},
	}

	app := fiber.New()
	srv.SetupMiddleware(app)
	app.Get("/limited", func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	// Exhaust the limiter and assert the final response still carries CORS headers.
	for i := 0; i < 100; i++ {
		req := httptest.NewRequest(http.MethodGet, "/limited", nil)
		req.Header.Set("Origin", "http://localhost:5173")
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		_ = resp.Body.Close()
	}

	req := httptest.NewRequest(http.MethodGet, "/limited", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, fiber.StatusTooManyRequests, resp.StatusCode)
	assert.Equal(t, "http://localhost:5173", resp.Header.Get("Access-Control-Allow-Origin"))
}

func TestSetupMiddleware_PreflightBypassesLimiter(t *testing.T) {
	srv := &Server{
		config: &config.Config{
			AllowedOrigins: "http://localhost:5173",
		},
	}

	app := fiber.New()
	srv.SetupMiddleware(app)
	app.Post("/limited", func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	// Saturate limiter using non-OPTIONS requests.
	for i := 0; i < 100; i++ {
		req := httptest.NewRequest(http.MethodPost, "/limited", nil)
		req.Header.Set("Origin", "http://localhost:5173")
		resp, err := app.Test(req, -1)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		_ = resp.Body.Close()
	}

	// Verify POST is now rate-limited.
	limitedReq := httptest.NewRequest(http.MethodPost, "/limited", nil)
	limitedReq.Header.Set("Origin", "http://localhost:5173")
	limitedResp, err := app.Test(limitedReq, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusTooManyRequests, limitedResp.StatusCode)
	_ = limitedResp.Body.Close()

	// Preflight should still pass and include CORS headers.
	preflightReq := httptest.NewRequest(http.MethodOptions, "/limited", nil)
	preflightReq.Header.Set("Origin", "http://localhost:5173")
	preflightReq.Header.Set("Access-Control-Request-Method", http.MethodPost)
	preflightReq.Header.Set("Access-Control-Request-Headers", "authorization,content-type")
	preflightResp, err := app.Test(preflightReq, -1)
	require.NoError(t, err)
	defer func() { _ = preflightResp.Body.Close() }()

	assert.Equal(t, fiber.StatusNoContent, preflightResp.StatusCode)
	assert.Equal(t, "http://localhost:5173", preflightResp.Header.Get("Access-Control-Allow-Origin"))
	assert.Contains(t, preflightResp.Header.Get("Access-Control-Allow-Methods"), http.MethodPost)
}
