// Package middleware provides authentication and authorization middleware for the application.
package middleware

import (
	"strconv"
	"strings"

	"sanctum/internal/config"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var cfg *config.Config

// InitMiddleware initializes authentication middleware with the given config.
func InitMiddleware(c *config.Config) {
	cfg = c
}

// AuthRequired is a middleware that enforces authentication for protected routes.
func AuthRequired(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authorization header required",
		})
	}

	// Extract token from "Bearer <token>"
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid authorization header format",
		})
	}

	tokenString := parts[1]

	// Parse and validate token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.NewError(fiber.StatusUnauthorized, "Invalid signing method")
		}
		return []byte(cfg.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid or expired token",
		})
	}

	// Extract claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token claims",
		})
	}

	// Extract user ID from "sub" claim (subject claim per RFC 7519)
	subClaim, ok := claims["sub"]
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token structure - missing subject",
		})
	}

	// Type assertion from interface to string
	subStr, ok := subClaim.(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token subject type",
		})
	}

	// Parse user ID from string to uint
	userIDVal, err := strconv.ParseUint(subStr, 10, 32)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid user ID in token",
		})
	}

	// Store user ID in context
	c.Locals("userID", uint(userIDVal))

	return c.Next()
}

// WebSocketAuthRequired is middleware that validates JWT tokens from query parameters for WebSocket connections.
func WebSocketAuthRequired(c *fiber.Ctx) error {
	// Try to get token from query parameter first (for WebSocket)
	token := c.Query("token")
	if token == "" {
		// Fall back to Authorization header (for regular HTTP)
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Token required",
			})
		}
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid authorization header format",
			})
		}
		token = parts[1]
	}

	// Parse and validate token
	parsedToken, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.NewError(fiber.StatusUnauthorized, "Invalid signing method")
		}
		return []byte(cfg.JWTSecret), nil
	})

	if err != nil || !parsedToken.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid or expired token",
		})
	}

	// Extract claims
	claims, ok := parsedToken.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token claims",
		})
	}

	// Extract user ID from "sub" claim (subject claim per RFC 7519)
	subClaim, ok := claims["sub"]
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token structure - missing subject",
		})
	}

	// Type assertion from interface to string
	subStr, ok := subClaim.(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token subject type",
		})
	}

	// Parse user ID from string to uint
	userIDVal, err := strconv.ParseUint(subStr, 10, 32)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid user ID in token",
		})
	}

	// Store user ID in context
	c.Locals("userID", uint(userIDVal))

	return c.Next()
}
