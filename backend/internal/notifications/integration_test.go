package notifications

import (
	"context"
	"sync/atomic"
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
)

// TestReaperWithRedis is a focused integration check that validates the reaper
// removes stale online set entries when the per-user last-seen key is absent.
// Requires a local Redis instance (127.0.0.1:6379) — the test will skip if
// Redis is unreachable.
func TestReaperWithRedis(t *testing.T) {
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:6379"})
	defer rdb.Close()

	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("redis not available: %v", err)
	}

	// Ensure a clean slate for our keys
	_ = rdb.SRem(ctx, defaultPresenceOnlineSetKey, "9999").Err()
	_ = rdb.Del(ctx, defaultPresenceLastSeenKeyNS+"9999").Err()

	// Add stale member (no last-seen key)
	if err := rdb.SAdd(ctx, defaultPresenceOnlineSetKey, "9999").Err(); err != nil {
		t.Fatalf("failed to SAdd: %v", err)
	}

	var offlineCount int32
	hub := NewHub(rdb)
	hub.presence.SetOfflineGracePeriod(1) // tiny grace; we call reapOnce directly
	hub.SetPresenceCallbacks(nil, func(_ uint) {
		atomic.AddInt32(&offlineCount, 1)
	})

	// Run a single reaper pass
	hub.presence.reapOnce(ctx)

	isMember, err := rdb.SIsMember(ctx, defaultPresenceOnlineSetKey, "9999").Result()
	if err != nil {
		t.Fatalf("failed SIsMember: %v", err)
	}
	assert.False(t, isMember, "stale member should have been removed")
	assert.Equal(t, int32(1), atomic.LoadInt32(&offlineCount))

	_ = hub.Shutdown(context.Background())
}
