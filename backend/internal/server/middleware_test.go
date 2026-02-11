package server

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

func TestServer_AuthRequired(t *testing.T) {
	// Setup app and config
	secret := "test-secret-key-12345678901234567890123456789012"
	s := &Server{
		config: &config.Config{JWTSecret: secret},
	}
	app := fiber.New()

	app.Get("/protected", s.AuthRequired(), func(c *fiber.Ctx) error {
		userID := c.Locals("userID")
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"userID": userID})
	})

	generateToken := func(userID uint, issuer, audience string, exp time.Duration) string {
		claims := jwt.MapClaims{
			"sub": strconv.FormatUint(uint64(userID), 10),
			"iss": issuer,
			"aud": audience,
			"exp": time.Now().Add(exp).Unix(),
			"jti": "test-jti-valid-length",
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		str, _ := token.SignedString([]byte(secret))
		return str
	}

	tests := []struct {
		name           string
		authHeader     string
		tokenParam     string
		expectedStatus int
	}{
		{
			name:           "Valid Token",
			authHeader:     "Bearer " + generateToken(123, "sanctum-api", "sanctum-client", time.Hour),
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Valid Token via Query Param",
			tokenParam:     generateToken(123, "sanctum-api", "sanctum-client", time.Hour),
			expectedStatus: http.StatusOK,
		},
		{
			name:           "Expired Token",
			authHeader:     "Bearer " + generateToken(123, "sanctum-api", "sanctum-client", -time.Hour),
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Invalid Issuer",
			authHeader:     "Bearer " + generateToken(123, "wrong-issuer", "sanctum-client", time.Hour),
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Invalid Audience",
			authHeader:     "Bearer " + generateToken(123, "sanctum-api", "wrong-audience", time.Hour),
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Missing Header and Param",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "Malformed Bearer Format",
			authHeader:     "BearerTokenOnly",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name: "Invalid Subject Type (Mocked Manually)",
			authHeader: "Bearer " + func() string {
				claims := jwt.MapClaims{"sub": 123, "iss": "sanctum-api", "aud": "sanctum-client", "exp": time.Now().Add(time.Hour).Unix()}
				token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
				str, _ := token.SignedString([]byte(secret))
				return str
			}(),
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := "/protected"
			if tt.tokenParam != "" {
				path += "?token=" + tt.tokenParam
			}
			req := httptest.NewRequest(http.MethodGet, path, nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}

			resp, err := app.Test(req)
			assert.NoError(t, err)
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)

			if tt.expectedStatus == http.StatusOK {
				var body map[string]interface{}
				_ = json.NewDecoder(resp.Body).Decode(&body)
				assert.Equal(t, float64(123), body["userID"])
			}
			_ = resp.Body.Close()
		})
	}
}
