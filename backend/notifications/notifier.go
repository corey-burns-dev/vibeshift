package notifications

import (
	"context"
	"encoding/json"
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

// PublishChatMessage publishes a chat message to a conversation channel
func (n *Notifier) PublishChatMessage(
	ctx context.Context, conversationID uint, payload string) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("chat:conv:%d", conversationID)
	return n.rdb.Publish(ctx, channel, payload).Err()
}

// PublishTypingIndicator publishes a typing indicator to a conversation
func (n *Notifier) PublishTypingIndicator(
	ctx context.Context, conversationID, userID uint, username string, isTyping bool) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("typing:conv:%d", conversationID)
	payload := map[string]interface{}{
		"user_id":   userID,
		"username":  username,
		"is_typing": isTyping,
	}
	payloadJSON, _ := json.Marshal(payload)
	return n.rdb.Publish(ctx, channel, string(payloadJSON)).Err()
}

// PublishPresence publishes a user's presence status to a conversation
func (n *Notifier) PublishPresence(
	ctx context.Context, conversationID, userID uint, username, status string) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("presence:conv:%d", conversationID)
	payload := map[string]interface{}{
		"user_id":  userID,
		"username": username,
		"status":   status, // "online", "offline", "away"
	}
	payloadJSON, _ := json.Marshal(payload)
	return n.rdb.Publish(ctx, channel, string(payloadJSON)).Err()
}

// StartChatSubscriber subscribes to chat-related patterns and calls onMessage
// for each incoming message. Subscribes to: chat:conv:*, typing:conv:*, presence:conv:*
func (n *Notifier) StartChatSubscriber(
	ctx context.Context, onMessage func(channel string, payload string)) error {
	if n.rdb == nil {
		return nil
	}
	sub := n.rdb.PSubscribe(ctx, "chat:conv:*", "typing:conv:*", "presence:conv:*")
	ch := sub.Channel()

	go func() {
		for msg := range ch {
			onMessage(msg.Channel, msg.Payload)
		}
	}()

	return nil
}

// Helper to derive channel name
func UserChannel(userID uint) string {
	return "notifications:user:" + strconv.FormatUint(uint64(userID), 10)
}

// Helper to derive conversation channel name
func ConversationChannel(conversationID uint) string {
	return "chat:conv:" + strconv.FormatUint(uint64(conversationID), 10)
}
