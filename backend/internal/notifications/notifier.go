// Package notifications provides real-time notification delivery and management.
package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"runtime/debug"
	"strconv"

	"github.com/redis/go-redis/v9"
)

// Notifier provides helpers to publish notifications into Redis channels
type Notifier struct {
	rdb *redis.Client
}

// NewNotifier creates a new Notifier instance using the provided Redis client.
func NewNotifier(rdb *redis.Client) *Notifier {
	return &Notifier{rdb: rdb}
}

// PublishUser sends a notification payload to a user's channel.
func (n *Notifier) PublishUser(
	ctx context.Context, userID uint, payload string,
) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("notifications:user:%d", userID)
	return n.rdb.Publish(ctx, channel, payload).Err()
}

// PublishBroadcast sends a notification payload to all connected users.
func (n *Notifier) PublishBroadcast(ctx context.Context, payload string) error {
	if n.rdb == nil {
		return nil
	}
	return n.rdb.Publish(ctx, "notifications:broadcast", payload).Err()
}

// StartPatternSubscriber subscribes to pattern `notifications:user:*` and calls onMessage
// for each incoming message. onMessage receives channel and payload.
func (n *Notifier) StartPatternSubscriber(
	ctx context.Context, onMessage func(channel string, payload string),
) error {
	if n.rdb == nil {
		return nil
	}
	sub := n.rdb.PSubscribe(ctx, "notifications:user:*", "notifications:broadcast")
	ch := sub.Channel()

	go func() {
		defer func() { _ = sub.Close() }()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("PANIC in PatternSubscriber: %v\n%s", r, debug.Stack())
						}
					}()
					onMessage(msg.Channel, msg.Payload)
				}()
			}
		}
	}()

	return nil
}

// PublishChatMessage publishes a chat message to a conversation channel
func (n *Notifier) PublishChatMessage(
	ctx context.Context, conversationID uint, payload string,
) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("chat:conv:%d", conversationID)
	return n.rdb.Publish(ctx, channel, payload).Err()
}

// PublishTypingIndicator publishes a typing indicator to a conversation
func (n *Notifier) PublishTypingIndicator(
	ctx context.Context, conversationID, userID uint, username string, isTyping bool,
) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("typing:conv:%d", conversationID)
	payload := map[string]interface{}{
		"user_id":       userID,
		"username":      username,
		"is_typing":     isTyping,
		"expires_in_ms": 5000,
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}
	return n.rdb.Publish(ctx, channel, string(payloadJSON)).Err()
}

// PublishPresence publishes a user's presence status to a conversation
func (n *Notifier) PublishPresence(
	ctx context.Context, conversationID, userID uint, username, status string,
) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("presence:conv:%d", conversationID)
	payload := map[string]interface{}{
		"user_id":  userID,
		"username": username,
		"status":   status, // "online", "offline", "away"
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}
	return n.rdb.Publish(ctx, channel, string(payloadJSON)).Err()
}

// StartChatSubscriber subscribes to chat-related patterns and calls onMessage
// for each incoming message. Subscribes to: chat:conv:*, typing:conv:*, presence:conv:*
func (n *Notifier) StartChatSubscriber(
	ctx context.Context, onMessage func(channel string, payload string),
) error {
	if n.rdb == nil {
		return nil
	}
	sub := n.rdb.PSubscribe(ctx, "chat:conv:*", "typing:conv:*", "presence:conv:*")
	ch := sub.Channel()

	go func() {
		defer func() { _ = sub.Close() }()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("PANIC in ChatSubscriber: %v\n%s", r, debug.Stack())
						}
					}()
					onMessage(msg.Channel, msg.Payload)
				}()
			}
		}
	}()

	return nil
}

// PublishGameAction publishes a game action (move, join, etc) to a room channel
func (n *Notifier) PublishGameAction(
	ctx context.Context, roomID uint, payload string,
) error {
	if n.rdb == nil {
		return nil
	}
	channel := fmt.Sprintf("game:room:%d", roomID)
	return n.rdb.Publish(ctx, channel, payload).Err()
}

// StartGameSubscriber subscribes to game room patterns
func (n *Notifier) StartGameSubscriber(
	ctx context.Context, onMessage func(channel string, payload string),
) error {
	if n.rdb == nil {
		return nil
	}
	sub := n.rdb.PSubscribe(ctx, "game:room:*")
	ch := sub.Channel()

	go func() {
		defer func() { _ = sub.Close() }()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("PANIC in GameSubscriber: %v\n%s", r, debug.Stack())
						}
					}()
					onMessage(msg.Channel, msg.Payload)
				}()
			}
		}
	}()

	return nil
}

// UserChannel derives the Redis channel name for a user.
func UserChannel(userID uint) string {
	return "notifications:user:" + strconv.FormatUint(uint64(userID), 10)
}

// ConversationChannel derives the Redis channel name for a conversation.
func ConversationChannel(conversationID uint) string {
	return "chat:conv:" + strconv.FormatUint(uint64(conversationID), 10)
}

// GameRoomChannel derives the Redis channel name for a game room.
func GameRoomChannel(roomID uint) string {
	return "game:room:" + strconv.FormatUint(uint64(roomID), 10)
}
