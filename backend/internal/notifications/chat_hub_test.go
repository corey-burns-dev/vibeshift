package notifications

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/stretchr/testify/assert"
)

type MockConn struct {
	LastMessage []byte
}

func (m *MockConn) WriteMessage(_ int, data []byte) error {
	m.LastMessage = data
	return nil
}

func (m *MockConn) Close() error {
	return nil
}

func TestChatHub_RegisterUnregister(t *testing.T) {
	hub := NewChatHub()
	hub.presence.SetOfflineGracePeriod(20 * time.Millisecond)
	client := &Client{
		UserID: 1,
		Send:   make(chan []byte, 10),
	}

	// Register
	hub.RegisterUser(client)
	hub.mu.RLock()
	assert.Len(t, hub.userConns[1], 1)
	hub.mu.RUnlock()

	// Unregister
	hub.UnregisterUser(client)
	hub.mu.RLock()
	assert.Empty(t, hub.userConns[1])
	hub.mu.RUnlock()

	_ = hub.Shutdown(context.Background())
}

func TestChatHub_BroadcastToConversation(t *testing.T) {
	hub := NewChatHub()
	hub.presence.SetOfflineGracePeriod(20 * time.Millisecond)
	client := &Client{
		UserID: 1,
		Send:   make(chan []byte, 10),
	}
	hub.RegisterUser(client)
	hub.JoinConversation(1, 101)

	msg := ChatMessage{
		Type:           "message",
		ConversationID: 101,
		Payload:        "Hello",
	}

	hub.BroadcastToConversation(101, msg)

	// Check if message was sent to client channel
	sentMsg := <-client.Send
	var received ChatMessage
	err := json.Unmarshal(sentMsg, &received)
	assert.NoError(t, err)
	assert.Equal(t, "message", received.Type)
	assert.Equal(t, uint(101), received.ConversationID)

	_ = hub.Shutdown(context.Background())
}

func TestChatHub_MultiDeviceSupport(t *testing.T) {
	hub := NewChatHub()
	hub.presence.SetOfflineGracePeriod(20 * time.Millisecond)
	userID := uint(42)

	client1 := &Client{UserID: userID, Send: make(chan []byte, 10)}
	client2 := &Client{UserID: userID, Send: make(chan []byte, 10)}

	hub.RegisterUser(client1)
	hub.RegisterUser(client2)

	hub.mu.RLock()
	assert.Len(t, hub.userConns[userID], 2)
	hub.mu.RUnlock()

	hub.JoinConversation(userID, 202)

	msg := ChatMessage{Type: "message", ConversationID: 202, Payload: "Multi-device test"}
	hub.BroadcastToConversation(202, msg)

	// Both clients should receive the message
	select {
	case <-client1.Send:
	default:
		t.Error("client1 did not receive message")
	}

	select {
	case <-client2.Send:
	default:
		t.Error("client2 did not receive message")
	}

	_ = hub.Shutdown(context.Background())
}

func TestChatHub_BroadcastToConversation_DoesNotSendToNonParticipants(t *testing.T) {
	hub := NewChatHub()
	hub.presence.SetOfflineGracePeriod(20 * time.Millisecond)

	participant := &Client{UserID: 1, Send: make(chan []byte, 10)}
	outsider := &Client{UserID: 2, Send: make(chan []byte, 10)}

	hub.RegisterUser(participant)
	hub.RegisterUser(outsider)
	hub.JoinConversation(1, 404)

	msg := ChatMessage{
		Type:           "room_message",
		ConversationID: 404,
		Payload:        "Scoped fanout",
	}
	hub.BroadcastToConversation(404, msg)

	select {
	case <-participant.Send:
	default:
		t.Fatal("participant did not receive room_message")
	}

	select {
	case <-outsider.Send:
		t.Fatal("non-participant unexpectedly received room_message")
	default:
	}

	_ = hub.Shutdown(context.Background())
}

func TestChatHub_UnregisterCleanup(t *testing.T) {
	hub := NewChatHub()
	hub.presence.SetOfflineGracePeriod(20 * time.Millisecond)
	userID := uint(7)
	convID := uint(303)

	client := &Client{UserID: userID, Send: make(chan []byte, 10)}
	hub.RegisterUser(client)
	hub.JoinConversation(userID, convID)

	hub.mu.RLock()
	assert.Contains(t, hub.conversations[convID], userID)
	assert.Contains(t, hub.userActiveConvs[userID], convID)
	hub.mu.RUnlock()

	hub.UnregisterUser(client)

	assert.Eventually(t, func() bool {
		hub.mu.RLock()
		defer hub.mu.RUnlock()
		_, userConnExists := hub.userConns[userID]
		_, convExists := hub.conversations[convID]
		_, activeExists := hub.userActiveConvs[userID]
		return !userConnExists && !convExists && !activeExists
	}, time.Second, 10*time.Millisecond)

	_ = hub.Shutdown(context.Background())
}

func TestChatHub_GracePeriodSuppressesOfflineOnRapidReconnect(t *testing.T) {
	hub := NewChatHub()
	hub.presence.SetOfflineGracePeriod(40 * time.Millisecond)

	userConnA := &Client{UserID: 1, Send: make(chan []byte, 10)}

	hub.RegisterUser(userConnA)

	hub.UnregisterUser(userConnA)
	time.Sleep(10 * time.Millisecond)
	userConnB := &Client{UserID: 1, Send: make(chan []byte, 10)}
	hub.RegisterUser(userConnB)
	time.Sleep(80 * time.Millisecond)

	hub.presence.mu.RLock()
	notified := hub.presence.offlineNotified[1]
	hub.presence.mu.RUnlock()
	assert.False(t, notified)
	assert.True(t, hub.IsUserOnline(1))

	_ = hub.Shutdown(context.Background())
}

func TestChatHub_MultipleConnections_LastDisconnectTriggersOffline(t *testing.T) {
	hub := NewChatHub()
	hub.presence.SetOfflineGracePeriod(30 * time.Millisecond)

	userConnA := &Client{UserID: 1, Send: make(chan []byte, 10)}
	userConnB := &Client{UserID: 1, Send: make(chan []byte, 10)}

	hub.RegisterUser(userConnA)
	hub.RegisterUser(userConnB)

	hub.UnregisterUser(userConnA)
	time.Sleep(60 * time.Millisecond)
	hub.presence.mu.RLock()
	notified := hub.presence.offlineNotified[1]
	hub.presence.mu.RUnlock()
	assert.False(t, notified)

	hub.UnregisterUser(userConnB)
	assert.Eventually(t, func() bool {
		hub.presence.mu.RLock()
		defer hub.presence.mu.RUnlock()
		return hub.presence.offlineNotified[1]
	}, time.Second, 10*time.Millisecond)
	assert.False(t, hub.IsUserOnline(1))

	_ = hub.Shutdown(context.Background())
}

func TestChatHub_ReaperRemovesStalePresenceAndBroadcastsOffline(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rdb.Close()

	hub := NewChatHub(rdb)
	hub.presence.SetOfflineGracePeriod(20 * time.Millisecond)

	outsider := &Client{UserID: 2, Send: make(chan []byte, 20)}
	hub.RegisterUser(outsider)
	drainMessages(outsider.Send)

	ctx := context.Background()
	assert.NoError(t, rdb.SAdd(ctx, defaultPresenceOnlineSetKey, "99").Err())

	hub.presence.reapOnce(ctx)

	assert.True(t, hasOfflineStatus(outsider.Send, 99))
	isMember, err := rdb.SIsMember(ctx, defaultPresenceOnlineSetKey, "99").Result()
	assert.NoError(t, err)
	assert.False(t, isMember)

	_ = hub.Shutdown(context.Background())
}

func drainMessages(ch <-chan []byte) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}

func hasOfflineStatus(ch <-chan []byte, userID uint) bool {
	found := false
	for {
		select {
		case raw := <-ch:
			var msg struct {
				Type    string `json:"type"`
				Payload struct {
					Status string `json:"status"`
					UserID uint   `json:"user_id"`
				} `json:"payload"`
			}
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
			if msg.Type == "user_status" && msg.Payload.Status == "offline" && msg.Payload.UserID == userID {
				found = true
			}
		default:
			return found
		}
	}
}
