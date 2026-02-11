package repository

import (
	"context"
	"testing"

	"sanctum/internal/models"

	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}

	err = db.AutoMigrate(
		&models.User{},
		&models.Conversation{},
		&models.Message{},
		&models.ConversationParticipant{},
	)
	if err != nil {
		t.Fatalf("Failed to migrate database: %v", err)
	}

	return db
}

func TestChatRepository(t *testing.T) {
	db := setupTestDB(t)
	repo := NewChatRepository(db)
	ctx := context.Background()

	// Create users
	user1 := &models.User{Username: "user1", Email: "u1@e.com"}
	user2 := &models.User{Username: "user2", Email: "u2@e.com"}
	db.Create(user1)
	db.Create(user2)

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
		db.Create(conv)

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
		db.Create(conv)
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
		db.Create(conv)

		msg := &models.Message{
			ConversationID: conv.ID,
			SenderID:       user1.ID,
			Content:        "Msg 1",
		}
		db.Create(msg)

		msgs, err := repo.GetMessages(ctx, conv.ID, 10, 0)
		assert.NoError(t, err)
		assert.Equal(t, 1, len(msgs))
		assert.Equal(t, "Msg 1", msgs[0].Content)
	})
}
