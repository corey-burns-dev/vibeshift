package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"sanctum/internal/config"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

func TestAuthRequired(t *testing.T) {
	// Setup app and config
	app := fiber.New()
	secret := "test-secret-key-12345678901234567890123456789012"
	InitMiddleware(&config.Config{JWTSecret: secret})

	app.Get("/test", AuthRequired, func(c *fiber.Ctx) error {
		userID := c.Locals("userID")
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"userID": userID})
	})

	generateToken := func(userID uint, exp time.Duration) string {
		claims := jwt.MapClaims{
			"sub": strconv.FormatUint(uint64(userID), 10),
			"exp": time.Now().Add(exp).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		s, _ := token.SignedString([]byte(secret))
		return s
	}

	tests := []struct {
		name           string
		authHeader     string
		expectedStatus int
		expectedUserID uint
	}{
		{
			name:           "Happy Path",
			authHeader:     "Bearer " + generateToken(123, time.Hour),
			expectedStatus: http.StatusOK,
			expectedUserID: 123,
		},
		{
			name:           "Missing Header",
			authHeader:     "",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Invalid Format",
			authHeader:     "Basic dXNlcjpwYXNz",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Malformed Token",
			authHeader:     "Bearer malformed.token.here",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Expired Token",
			authHeader:     "Bearer " + generateToken(123, -time.Hour),
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		tt := tt // capture range variable
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}

			resp, err := app.Test(req)
			defer func() { _ = resp.Body.Close() }()
			assert.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			if tt.expectedStatus == http.StatusOK {
				// Verify userID was set in locals
				// (Actually, since we return it in JSON, we can check that)
				// Note: in a real unit test we might just check the handler was called.
				var body map[string]interface{}
				if err := json.NewDecoder(resp.Body).Decode(&body); err == nil {
					assert.Equal(t, float64(tt.expectedUserID), body["userID"])
				}
			}
		})
	}
}

func TestWebSocketAuthRequired(t *testing.T) {
	app := fiber.New()
	secret := "test-secret-key-12345678901234567890123456789012"
	InitMiddleware(&config.Config{JWTSecret: secret})

	app.Get("/ws-test", WebSocketAuthRequired, func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	generateToken := func(userID uint) string {
		claims := jwt.MapClaims{
			"sub": strconv.FormatUint(uint64(userID), 10),
			"exp": time.Now().Add(time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		s, _ := token.SignedString([]byte(secret))
		return s
	}

	tests := []struct {
		name           string
		tokenParam     string
		authHeader     string
		expectedStatus int
	}{
		{
			name:           "Token via Query Param",
			tokenParam:     generateToken(1),
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Token via Header",
			authHeader:     "Bearer " + generateToken(1),
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Missing Token",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Invalid Token",
			tokenParam:     "invalid-token",
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := "/ws-test"
			if tt.tokenParam != "" {
				path += "?token=" + tt.tokenParam
			}
			req := httptest.NewRequest(http.MethodGet, path, nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}

			resp, err := app.Test(req)
			defer func() { _ = resp.Body.Close() }()
			assert.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
		})
	}
}
