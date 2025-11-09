package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// RateLimit returns a Fiber middleware enforcing `limit` requests per `window`.
// It keys by authenticated userID (if set in c.Locals("userID")) otherwise by remote IP.
func RateLimit(rdb *redis.Client, limit int, window time.Duration) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := context.Background()

		var id string
		if uid := c.Locals("userID"); uid != nil {
			id = fmt.Sprintf("user:%v", uid)
		} else {
			id = fmt.Sprintf("ip:%s", c.IP())
		}

		key := fmt.Sprintf("rl:%s:%s", c.Path(), id)

		// INCR and set EXPIRE if new
		cnt, err := rdb.Incr(ctx, key).Result()
		if err != nil {
			// Fail-open on Redis error
			return c.Next()
		}
		if cnt == 1 {
			rdb.Expire(ctx, key, window)
		}
		if cnt > int64(limit) {
			// Too many requests
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "rate limit exceeded",
			})
		}
		return c.Next()
	}
}
