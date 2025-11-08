package redispkg

import (
	"context"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/redis/go-redis/v9/maintnotifications"
)

// RedisClient is a small interface used by handlers. Keep it minimal for testability.
type RedisClient interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, val interface{}, ttl time.Duration) error
	Close() error
}

// NewClient builds a redis client from a REDIS_URL-like string. Accepts either
// a plain `host:port` or a `redis://`/`rediss://` URL. It disables
// maintnotifications by default to avoid handshake attempts on servers that
// don't implement the subcommand.
func NewClient(raw string) *redis.Client {
	if raw == "" {
		raw = "redis:6379"
	}

	addr := raw
	opts := &redis.Options{}
	if strings.HasPrefix(raw, "redis://") || strings.HasPrefix(raw, "rediss://") {
		if u, err := url.Parse(raw); err == nil {
			addr = u.Host
			if u.User != nil {
				if pw, ok := u.User.Password(); ok {
					opts.Password = pw
				}
			}
			if p := strings.Trim(u.Path, "/"); p != "" {
				if dbn, err := strconv.Atoi(p); err == nil {
					opts.DB = dbn

				}
			}
		}
	}

	opts.Addr = addr
	// Disable maintenance notifications handshake by default.
	opts.MaintNotificationsConfig = &maintnotifications.Config{Mode: maintnotifications.ModeDisabled}

	client := redis.NewClient(opts)
	// warm up (best-effort)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	_ = client.Ping(ctx).Err()
	return client
}

// Client is a thin adapter around *redis.Client that implements RedisClient.
type Client struct {
	Raw *redis.Client
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
	return c.Raw.Get(ctx, key).Result()
}

func (c *Client) Set(ctx context.Context, key string, val interface{}, ttl time.Duration) error {
	return c.Raw.Set(ctx, key, val, ttl).Err()
}

func (c *Client) Close() error {
	return c.Raw.Close()
}

// NewAdapter creates the adapter wrapper for a *redis.Client.
func NewAdapter(rawClient *redis.Client) *Client {
	return &Client{Raw: rawClient}
}

var _ RedisClient = (*Client)(nil)
