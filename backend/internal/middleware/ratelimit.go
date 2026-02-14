// Package middleware provides authentication and authorization middleware for the application.
package middleware

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// FailPolicy defines the behavior when the rate limit store (Redis) is unavailable.
type FailPolicy int

const (
	// FailOpen allows the request to proceed if Redis is unavailable.
	FailOpen FailPolicy = iota
	// FailClosed blocks the request (503 Service Unavailable) if Redis is unavailable.
	FailClosed
)

// CheckRateLimit checks if a resource has exceeded its rate limit.
// Returns true if allowed, false if limit exceeded.
// Rate limiting is disabled when APP_ENV is "test", "development" or "stress" so dev and load test workflows are not throttled.
func CheckRateLimit(ctx context.Context, rdb *redis.Client, resource, id string, limit int, window time.Duration) (bool, error) {
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "development"
	}

	switch env {
	case "test", "development", "stress":
		return true, nil
	}

	if rdb == nil {
		return false, fmt.Errorf("redis client is nil")
	}

	key := fmt.Sprintf("rl:%s:%s", resource, id)

	// INCR and set EXPIRE if new
	cnt, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		return false, err
	}
	if cnt == 1 {
		rdb.Expire(ctx, key, window)
	}
	if cnt > int64(limit) {
		return false, nil
	}
	return true, nil
}

// RateLimit returns a Fiber middleware enforcing `limit` requests per `window`.
// It keys by authenticated userID (if set in c.Locals("userID")) otherwise by remote IP.
// It defaults to FailOpen policy.
func RateLimit(rdb *redis.Client, limit int, window time.Duration, name ...string) fiber.Handler {
	return RateLimitWithPolicy(rdb, limit, window, FailOpen, name...)
}

// RateLimitWithPolicy returns a Fiber middleware enforcing `limit` requests per `window` with a specific failure policy.
func RateLimitWithPolicy(rdb *redis.Client, limit int, window time.Duration, policy FailPolicy, name ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := context.Background()

		var id string
		if uid := c.Locals("userID"); uid != nil {
			id = fmt.Sprintf("user:%v", uid)
		} else {
			id = fmt.Sprintf("ip:%s", c.IP())
		}

		// Use the provided name or the request path as the resource identifier
		resource := c.Path()
		if len(name) > 0 {
			resource = name[0]
		}

		allowed, err := CheckRateLimit(ctx, rdb, resource, id, limit, window)
		if err != nil {
			if policy == FailClosed {
				log.Printf("WARNING: Rate limit fail-closed for route %s (resource: %s, policy: FailClosed): %v", c.Path(), resource, err)
				return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
					"error": "rate limit unavailable",
				})
			}
			// Default FailOpen
			return c.Next()
		}

		if !allowed {
			// Too many requests
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "rate limit exceeded",
			})
		}
		return c.Next()
	}
}
