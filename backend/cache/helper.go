// Package cache provides Redis caching utilities for the application.
package cache

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// GetJSON attempts to get the key from Redis and unmarshal into dest.
// Returns (true, nil) if found and unmarshaled, (false, nil) if not found.
func GetJSON(ctx context.Context, key string, dest any) (bool, error) {
	if client == nil {
		return false, nil
	}
	s, err := client.Get(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal([]byte(s), dest); err != nil {
		return false, err
	}
	return true, nil
}

// SetJSON marshals v and sets the key with TTL.
func SetJSON(ctx context.Context, key string, v any, ttl time.Duration) error {
	if client == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return client.Set(ctx, key, b, ttl).Err()
}

// Aside tries Redis first, on miss it calls fetch (which should populate dest),
// then stores the result in Redis with ttl. fetch must write into dest.
// Aside tries Redis first, on miss it calls fetch (which should populate dest),
// then stores the result in Redis with ttl. fetch must write into dest.
func Aside(ctx context.Context, key string, dest any, ttl time.Duration, fetch func() error) (err error) {
	found, err := GetJSON(ctx, key, dest)
	if err != nil {
		return err
	}
	if found {
		return nil
	}

	// Fetch from source (DB)
	if err := fetch(); err != nil {
		return err
	}

	// Store into cache (best-effort) - we intentionally ignore cache failures
	if err := SetJSON(ctx, key, dest, ttl); err != nil {
		// Best-effort caching: log but don't fail the operation
		return nil
	}
	return nil
}
