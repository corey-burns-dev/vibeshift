// Package middleware provides authentication and authorization middleware for the application.
package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"sanctum/internal/observability"

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
// Rate limiting is disabled when env is "test", "development" or "stress" so dev and load test workflows are not throttled.
func CheckRateLimit(ctx context.Context, rdb *redis.Client, env, resource, id string, limit int, window time.Duration) (bool, error) {
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

	// Atomic INCR+EXPIRE via Lua script to prevent race window where
	// EXPIRE fails after INCR, permanently rate-limiting the user.
	cnt, err := rateLimitScript.Run(ctx, rdb, []string{key}, int(window.Seconds())).Int64()
	if err != nil {
		return false, err
	}
	if cnt > int64(limit) {
		return false, nil
	}
	return true, nil
}

// rateLimitScript atomically increments and sets expiry on first use.
var rateLimitScript = redis.NewScript(`
	local cnt = redis.call('INCR', KEYS[1])
	if cnt == 1 then
		redis.call('EXPIRE', KEYS[1], ARGV[1])
	end
	return cnt
`)

// RateLimit returns a Fiber middleware enforcing `limit` requests per `window`.
// It keys by authenticated userID (if set in c.Locals("userID")) otherwise by remote IP.
// It defaults to FailOpen policy.
func RateLimit(rdb *redis.Client, env string, limit int, window time.Duration, name ...string) fiber.Handler {
	return RateLimitWithPolicy(rdb, env, limit, window, FailOpen, name...)
}

// RateLimitWithPolicy returns a Fiber middleware enforcing `limit` requests per `window` with a specific failure policy.
func RateLimitWithPolicy(rdb *redis.Client, env string, limit int, window time.Duration, policy FailPolicy, name ...string) fiber.Handler {
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

		allowed, err := CheckRateLimit(ctx, rdb, env, resource, id, limit, window)
		if err != nil {
			if policy == FailClosed {
				observability.GlobalLogger.WarnContext(c.UserContext(), "rate limit fail-closed",
					slog.String("route", c.Path()),
					slog.String("resource", resource),
					slog.String("policy", "FailClosed"),
					slog.String("error", err.Error()),
				)
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
