package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Global Redis client (initialized in init)
var redisClient *redis.Client

func init() {
	raw := os.Getenv("REDIS_URL")
	if raw == "" {
		// default to container hostname used in compose
		raw = "redis:6379"
	}

	// Accept either plain `host:port` or a URL like `redis://redis:6379`.
	addr := raw
	opts := &redis.Options{}
	if strings.HasPrefix(raw, "redis://") || strings.HasPrefix(raw, "rediss://") {
		if u, err := url.Parse(raw); err == nil {
			// host:port
			addr = u.Host
			// password (if any)
			if u.User != nil {
				if pw, ok := u.User.Password(); ok {
					opts.Password = pw
				}
			}
			// optional DB as path: /0
			if p := strings.Trim(u.Path, "/"); p != "" {
				if dbn, err := strconv.Atoi(p); err == nil {
					opts.DB = dbn
				}
			}
		}
	}

	opts.Addr = addr
	redisClient = redis.NewClient(opts)
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
