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

func GetClient() *redis.Client {
	return Client
}
