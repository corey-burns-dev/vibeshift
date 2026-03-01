package notifications

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
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
