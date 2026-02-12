package notifications

import (
	"encoding/json"
	"testing"

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
}

func TestChatHub_BroadcastToConversation(t *testing.T) {
	hub := NewChatHub()
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
}

func TestChatHub_MultiDeviceSupport(t *testing.T) {
	hub := NewChatHub()
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
}

func TestChatHub_BroadcastToConversation_DoesNotSendToNonParticipants(t *testing.T) {
	hub := NewChatHub()

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
}

func TestChatHub_UnregisterCleanup(t *testing.T) {
	hub := NewChatHub()
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

	hub.mu.RLock()
	assert.NotContains(t, hub.userConns, userID)
	assert.NotContains(t, hub.conversations, convID)
	assert.NotContains(t, hub.userActiveConvs, userID)
	hub.mu.RUnlock()
}
