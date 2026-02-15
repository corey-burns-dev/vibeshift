// Package cache provides Redis caching utilities for the application.
package cache

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"sanctum/internal/middleware"

	"github.com/redis/go-redis/v9"
)

var client *redis.Client

type metricsHook struct{}

func (h metricsHook) DialHook(next redis.DialHook) redis.DialHook {
	return next
}

func (h metricsHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		err := next(ctx, cmd)
		if err != nil && !errors.Is(err, redis.Nil) {
			middleware.RedisErrors.WithLabelValues(cmd.Name()).Inc()
		}
		return err
	}
}

func (h metricsHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		err := next(ctx, cmds)
		if err != nil && !errors.Is(err, redis.Nil) {
			middleware.RedisErrors.WithLabelValues("pipeline").Inc()
		}
		return err
	}
}

// InitRedis initializes the Redis client with the given address.
func InitRedis(addr string) {
	var opts *redis.Options
	if strings.Contains(addr, "://") {
		parsed, err := redis.ParseURL(addr)
		if err != nil {
			log.Printf("Redis connection warning: invalid REDIS_URL %q: %v (continuing without cache)", addr, err)
			client = nil
			return
		}
		opts = parsed
	} else {
		opts = &redis.Options{Addr: addr}
	}

	client = redis.NewClient(opts)
	client.AddHook(metricsHook{})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("Redis connection warning: %v (continuing without cache)", err)
		client = nil
	} else {
		log.Println("Redis connected successfully")
	}
}

// GetClient returns the current Redis client instance.
func GetClient() *redis.Client {
	return client
}
