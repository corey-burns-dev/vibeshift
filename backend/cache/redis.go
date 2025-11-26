// Package cache provides Redis caching utilities for the application.
package cache

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

var client *redis.Client

// InitRedis initializes the Redis client with the given address.
func InitRedis(addr string) {
	client = redis.NewClient(&redis.Options{
		Addr: addr,
	})

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
