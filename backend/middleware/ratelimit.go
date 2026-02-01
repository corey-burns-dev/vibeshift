// Package middleware provides authentication and authorization middleware for the application.
package middleware

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// CheckRateLimit checks if a resource has exceeded its rate limit.
// Returns true if allowed, false if limit exceeded.
func CheckRateLimit(ctx context.Context, rdb *redis.Client, resource, id string, limit int, window time.Duration) (bool, error) {
	if os.Getenv("APP_ENV") == "test" {
		return true, nil
	}

	if rdb == nil {
		return true, nil // Fail-open if Redis is not available
	}

	key := fmt.Sprintf("rl:%s:%s", resource, id)

	// INCR and set EXPIRE if new
	cnt, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		return true, err // Fail-open on Redis error
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
// The optional `name` parameter allows grouping different routes under the same rate limit.
func RateLimit(rdb *redis.Client, limit int, window time.Duration, name ...string) fiber.Handler {
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
			// Fail-open
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
