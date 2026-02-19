package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupChatBanHandlerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.Conversation{},
		&models.ConversationParticipant{},
		&models.ChatroomModerator{},
		&models.ChatroomBan{},
	); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	return db
}

func TestChatroomBanHandlers_CRUD(t *testing.T) {
	t.Parallel()

	db := setupChatBanHandlerTestDB(t)
	s := &Server{db: db}

	admin := models.User{Username: "admin", Email: "admin@example.com", Password: "pw", IsAdmin: true}
	target := models.User{Username: "target", Email: "target@example.com", Password: "pw"}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create target: %v", err)
	}

	room := models.Conversation{Name: "Room", IsGroup: true, CreatedBy: admin.ID}
	if err := db.Create(&room).Error; err != nil {
		t.Fatalf("create room: %v", err)
	}
	if err := db.Create(&models.ConversationParticipant{ConversationID: room.ID, UserID: target.ID}).Error; err != nil {
		t.Fatalf("create participant: %v", err)
	}

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return c.Next()
	})
	app.Get("/chatrooms/:id/bans", s.ListChatroomBans)
	app.Post("/chatrooms/:id/bans/:userId", s.AddChatroomBan)
	app.Delete("/chatrooms/:id/bans/:userId", s.RemoveChatroomBan)

	t.Run("add ban removes participant", func(t *testing.T) {
		body := []byte(`{"reason":"spam"}`)
		req := httptest.NewRequest(http.MethodPost, "/chatrooms/1/bans/2", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		var ban models.ChatroomBan
		if err := db.Where("conversation_id = ? AND user_id = ?", room.ID, target.ID).First(&ban).Error; err != nil {
			t.Fatalf("missing ban row: %v", err)
		}
		if ban.Reason != "spam" {
			t.Fatalf("expected reason spam, got %q", ban.Reason)
		}

		var participantCount int64
		if err := db.Model(&models.ConversationParticipant{}).
			Where("conversation_id = ? AND user_id = ?", room.ID, target.ID).
			Count(&participantCount).Error; err != nil {
			t.Fatalf("count participant rows: %v", err)
		}
		if participantCount != 0 {
			t.Fatalf("expected participant removed, count=%d", participantCount)
		}
	})

	t.Run("list bans", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/chatrooms/1/bans", nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("remove ban", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/chatrooms/1/bans/2", nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		var count int64
		if err := db.Model(&models.ChatroomBan{}).
			Where("conversation_id = ? AND user_id = ?", room.ID, target.ID).
			Count(&count).Error; err != nil {
			t.Fatalf("count ban rows: %v", err)
		}
		if count != 0 {
			t.Fatalf("expected ban removed, count=%d", count)
		}
	})
}

func TestChatroomBanHandlers_ForbiddenWhenNotModerator(t *testing.T) {
	t.Parallel()

	db := setupChatBanHandlerTestDB(t)
	s := &Server{db: db}

	actor := models.User{Username: "actor", Email: "actor@example.com", Password: "pw", IsAdmin: false}
	target := models.User{Username: "target", Email: "target2@example.com", Password: "pw"}
	if err := db.Create(&actor).Error; err != nil {
		t.Fatalf("create actor: %v", err)
	}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create target: %v", err)
	}
	room := models.Conversation{Name: "Room", IsGroup: true, CreatedBy: target.ID}
	if err := db.Create(&room).Error; err != nil {
		t.Fatalf("create room: %v", err)
	}

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", actor.ID)
		return c.Next()
	})
	app.Post("/chatrooms/:id/bans/:userId", s.AddChatroomBan)

	req := httptest.NewRequest(http.MethodPost, "/chatrooms/1/bans/2", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}
