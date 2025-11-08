package handlers

import (
	"context"
	"log"
	"net/http"
	"time"
)

// RedisClient is the minimal interface our handlers expect.
type RedisClient interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, val interface{}, ttl time.Duration) error
}

type Handlers struct {
	Redis RedisClient
}

var healthResponse = []byte(`{"status": "ok","service": "ai-chat"}`)
var pingResponse = []byte(`{"message": "pong"}`)

func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if h.Redis != nil {
		if cached, err := h.Redis.Get(ctx, "health"); err == nil {
			w.Header().Set("Content-Type", "application/json")
			if _, err := w.Write([]byte(cached)); err != nil {
				log.Printf("write error: %v", err)
			}
			return
		}
		// set cache best-effort
		_ = h.Redis.Set(ctx, "health", string(healthResponse), 5*time.Second)
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(healthResponse); err != nil {
		log.Printf("write error: %v", err)
	}
}

func (h *Handlers) Ping(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(pingResponse); err != nil {
		log.Printf("write error: %v", err)
	}
}
