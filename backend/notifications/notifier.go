package notifications

import (
	"context"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"
)

// Notifier provides helpers to publish notifications into Redis channels
type Notifier struct {
	rdb *redis.Client
}

func NewNotifier(rdb *redis.Client) *Notifier {
	return &Notifier{rdb: rdb}
}

// PublishUser sends a notification payload to a user's channel.
func (n *Notifier) PublishUser(
	ctx context.Context, userID uint, payload string) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("notifications:user:%d", userID)
	return n.rdb.Publish(ctx, channel, payload).Err()
}

// StartPatternSubscriber subscribes to pattern `notifications:user:*` and calls onMessage
// for each incoming message. onMessage receives channel and payload.
func (n *Notifier) StartPatternSubscriber(
	ctx context.Context, onMessage func(channel string, payload string)) error {
	if n.rdb == nil {
		return nil
	}
	sub := n.rdb.PSubscribe(ctx, "notifications:user:*")
	ch := sub.Channel()

	go func() {
		for msg := range ch {
			// Example channel: notifications:user:123
			onMessage(msg.Channel, msg.Payload)
		}
	}()

	return nil
}

// Helper to derive channel name
func UserChannel(userID uint) string {
	return "notifications:user:" + strconv.FormatUint(uint64(userID), 10)
}
