package notifications

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNotifier_PublishUser(t *testing.T) {
	// Notifier with nil Redis should return nil error (fail-open/noop)
	n := NewNotifier(nil)
	err := n.PublishUser(context.Background(), 1, "test payload")
	assert.NoError(t, err)
}

func TestUserChannel(t *testing.T) {
	t.Parallel()
	tests := []struct {
		userID   uint
		expected string
	}{
		{1, "notifications:user:1"},
		{100, "notifications:user:100"},
	}

	for _, tt := range tests {
		assert.Equal(t, tt.expected, UserChannel(tt.userID))
	}
}

func TestConversationChannel(t *testing.T) {
	t.Parallel()
	assert.Equal(t, "chat:conv:5", ConversationChannel(5))
}

func TestNotifier_StartVideoChatSubscriber_StopsOnCancel(t *testing.T) {
	mr, err := miniredis.Run()
	require.NoError(t, err)
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer func() { _ = rdb.Close() }()

	n := NewNotifier(rdb)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var received int32
	payloads := make(chan string, 2)
	require.NoError(t, n.StartVideoChatSubscriber(ctx, func(_ string, payload string) {
		atomic.AddInt32(&received, 1)
		payloads <- payload
	}))

	require.NoError(t, n.PublishVideoChatSignal(context.Background(), "room-1", "before-cancel"))
	assert.Eventually(t, func() bool {
		return atomic.LoadInt32(&received) >= 1
	}, time.Second, 10*time.Millisecond)

	cancel()
	time.Sleep(20 * time.Millisecond)

	// Drain the pre-cancel message to avoid false positives.
	select {
	case <-payloads:
	default:
	}

	require.NoError(t, n.PublishVideoChatSignal(context.Background(), "room-1", "after-cancel"))
	assert.Never(t, func() bool {
		select {
		case payload := <-payloads:
			return payload == "after-cancel"
		default:
			return false
		}
	}, 200*time.Millisecond, 10*time.Millisecond)
}
