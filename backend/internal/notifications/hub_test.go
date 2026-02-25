package notifications

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
)

const (
	testEventuallyTimeout = time.Second
	testPollInterval      = 10 * time.Millisecond
)

func TestHub_GracePeriodSuppressesOfflineOnRapidReconnect(t *testing.T) {
	hub := NewHub()
	hub.presence.SetOfflineGracePeriod(40 * time.Millisecond)

	clientA, err := hub.Register(10, nil)
	assert.NoError(t, err)

	hub.UnregisterClient(clientA)
	_, err = hub.Register(10, nil)
	assert.NoError(t, err)

	assert.Never(t, func() bool {
		hub.presence.mu.RLock()
		defer hub.presence.mu.RUnlock()
		return hub.presence.offlineNotified[10]
	}, 20*testPollInterval, testPollInterval)
	assert.True(t, hub.IsOnline(10))

	_ = hub.Shutdown(context.Background())
}

func TestHub_MultiConnectionLastDisconnectTriggersOfflineOnce(t *testing.T) {
	hub := NewHub()
	hub.presence.SetOfflineGracePeriod(30 * time.Millisecond)

	clientA, err := hub.Register(15, nil)
	assert.NoError(t, err)
	clientB, err := hub.Register(15, nil)
	assert.NoError(t, err)

	hub.UnregisterClient(clientA)
	assert.Never(t, func() bool {
		hub.presence.mu.RLock()
		defer hub.presence.mu.RUnlock()
		return hub.presence.offlineNotified[15]
	}, 30*testPollInterval, testPollInterval)

	hub.UnregisterClient(clientB)
	assert.Eventually(t, func() bool {
		hub.presence.mu.RLock()
		defer hub.presence.mu.RUnlock()
		return hub.presence.offlineNotified[15]
	}, testEventuallyTimeout, testPollInterval)
	assert.False(t, hub.IsOnline(15))

	_ = hub.Shutdown(context.Background())
}

func TestHub_ReaperRemovesStalePresence(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer func() { _ = rdb.Close() }()

	hub := NewHub(rdb)

	var offlineCount int32
	hub.SetPresenceCallbacks(nil, func(_ uint) {
		atomic.AddInt32(&offlineCount, 1)
	})

	ctx := context.Background()
	assert.NoError(t, rdb.SAdd(ctx, defaultPresenceOnlineSetKey, "44").Err())

	hub.presence.reapOnce(ctx)

	isMember, err := rdb.SIsMember(ctx, defaultPresenceOnlineSetKey, "44").Result()
	assert.NoError(t, err)
	assert.False(t, isMember)
	assert.Equal(t, int32(1), atomic.LoadInt32(&offlineCount))

	_ = hub.Shutdown(context.Background())
}
