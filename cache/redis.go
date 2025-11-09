package cache

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

var Client *redis.Client

func InitRedis(addr string) {
	Client = redis.NewClient(&redis.Options{
		Addr: addr,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := Client.Ping(ctx).Err(); err != nil {
		log.Printf("Redis connection warning: %v (continuing without cache)", err)
		Client = nil
	} else {
		log.Println("Redis connected successfully")
	}
}

func Close() {
	if Client != nil {
		if err := Client.Close(); err != nil {
			log.Printf("Error closing Redis: %v", err)
		}
	}
}
