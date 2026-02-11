package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"sanctum/internal/models"

	"github.com/stretchr/testify/assert"
)

func TestChatRepository_Integration(t *testing.T) {
	repo := NewChatRepository(testDB)
	ctx := context.Background()

	// Create users with unique usernames/emails
	ts := time.Now().UnixNano()
	user1 := &models.User{Username: fmt.Sprintf("u1_%d", ts), Email: fmt.Sprintf("u1_%d@e.com", ts)}
	user2 := &models.User{Username: fmt.Sprintf("u2_%d", ts), Email: fmt.Sprintf("u2_%d@e.com", ts)}
	testDB.Create(user1)
	testDB.Create(user2)

	t.Run("CreateConversation", func(t *testing.T) {
		conv := &models.Conversation{
			CreatedBy: user1.ID,
			Name:      "Test Group",
			IsGroup:   true,
		}
		err := repo.CreateConversation(ctx, conv)
		assert.NoError(t, err)
		assert.NotZero(t, conv.ID)
	})

	t.Run("AddParticipant", func(t *testing.T) {
		conv := &models.Conversation{CreatedBy: user1.ID}
		testDB.Create(conv)

		err := repo.AddParticipant(ctx, conv.ID, user1.ID)
		assert.NoError(t, err)

		err = repo.AddParticipant(ctx, conv.ID, user2.ID)
		assert.NoError(t, err)

		// Verify
		fetched, _ := repo.GetConversation(ctx, conv.ID)
		assert.Equal(t, 2, len(fetched.Participants))
	})

	t.Run("CreateMessage", func(t *testing.T) {
		conv := &models.Conversation{CreatedBy: user1.ID}
		testDB.Create(conv)
		_ = repo.AddParticipant(ctx, conv.ID, user1.ID)

		msg := &models.Message{
			ConversationID: conv.ID,
			SenderID:       user1.ID,
			Content:        "Hello",
		}
		err := repo.CreateMessage(ctx, msg)
		assert.NoError(t, err)
		assert.NotZero(t, msg.ID)
	})

	t.Run("GetMessages", func(t *testing.T) {
		conv := &models.Conversation{CreatedBy: user1.ID}
		testDB.Create(conv)

		msg := &models.Message{
			ConversationID: conv.ID,
			SenderID:       user1.ID,
			Content:        "Msg 1",
		}
		testDB.Create(msg)

		msgs, err := repo.GetMessages(ctx, conv.ID, 10, 0)
		assert.NoError(t, err)
		assert.Equal(t, 1, len(msgs))
		assert.Equal(t, "Msg 1", msgs[0].Content)
	})
}
