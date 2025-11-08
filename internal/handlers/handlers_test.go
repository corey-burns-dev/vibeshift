package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"vibeshift/internal/handlers"
)

// mockRedis implements the minimal Redis client for testing.
type mockRedis struct {
	store map[string]string
}

func (m *mockRedis) Get(ctx context.Context, key string) (string, error) {
	if v, ok := m.store[key]; ok {
		return v, nil
	}
	return "", ErrNil
}

func (m *mockRedis) Set(ctx context.Context, key string, val interface{}, ttl time.Duration) error {
	m.store[key] = val.(string)
	return nil
}

// ErrNil is used to simulate redis nil response.
var ErrNil = &mockError{"nil"}

type mockError struct{ s string }

func (e *mockError) Error() string { return e.s }

func TestHealthHandler_CacheMiss(t *testing.T) {
	m := &mockRedis{store: map[string]string{}}
	h := &handlers.Handlers{Redis: m}

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	h.Health(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}
	if rr.Body.Len() == 0 {
		t.Fatalf("expected body, got empty")
	}
}

func TestHealthHandler_CacheHit(t *testing.T) {
	m := &mockRedis{store: map[string]string{"health": `{"status":"ok","service":"ai-chat"}`}}
	h := &handlers.Handlers{Redis: m}

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	h.Health(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}
	if rr.Body.String() != `{"status":"ok","service":"ai-chat"}` {
		t.Fatalf("unexpected body: %s", rr.Body.String())
	}
}
