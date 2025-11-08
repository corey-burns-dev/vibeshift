package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

// Global Redis client (initialized in init)
var redisClient *redis.Client

func init() {
	addr := os.Getenv("REDIS_URL")
	if addr == "" {
		// default to container hostname used in compose
		addr = "redis:6379"
	}
	redisClient = redis.NewClient(&redis.Options{
		Addr: addr,
	})
	// simple ping to warm up the client (non-fatal)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	_, _ = redisClient.Ping(ctx).Result()
}

var healthResponse = []byte(`{"status": "ok","service": "ai-chat"}`)
var pingResponse = []byte(`{"message": "pong"}`)

func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Try cached value in Redis
	if redisClient != nil {
		if cached, err := redisClient.Get(ctx, "health").Result(); err == nil {
			w.Header().Set("Content-Type", "application/json")
			if _, err := w.Write([]byte(cached)); err != nil {
				log.Printf("write error: %v", err)
			}
			return
		}
		// set cache (best-effort)
		_, _ = redisClient.Set(ctx, "health", string(healthResponse), 5*time.Second).Result()
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(healthResponse); err != nil {
		log.Printf("write error: %v", err)
	}
}

func pingHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(pingResponse); err != nil {
		log.Printf("write error: %v", err)
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthCheckHandler)
	mux.HandleFunc("/ping", pingHandler)
	mux.Handle("/", http.NotFoundHandler())
	log.Printf("Server starting on port :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
