package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupSanctumAdminTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.Sanctum{},
		&models.Conversation{},
		&models.ChatroomModerator{},
		&models.SanctumMembership{},
	); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	return db
}

func TestGetSanctumAdmins(t *testing.T) {
	t.Parallel()
	db := setupSanctumAdminTestDB(t)
	s := &Server{db: db}
	app := fiber.New()

	owner := models.User{Username: "owner", Email: "o@e.com"}
	db.Create(&owner)
	sanctum := models.Sanctum{Name: "The Sanctum", Slug: "sanctum"}
	db.Create(&sanctum)
	db.Create(&models.SanctumMembership{SanctumID: sanctum.ID, UserID: owner.ID, Role: models.SanctumMembershipRoleOwner})

	app.Get("/sanctums/:slug/admins", func(c *fiber.Ctx) error {
		c.Locals("userID", owner.ID)
		return s.GetSanctumAdmins(c)
	})

	t.Run("success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/sanctums/%s/admins", sanctum.Slug), nil)
		resp, _ := app.Test(req)
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})
}

func TestPromoteSanctumAdmin(t *testing.T) {
	t.Parallel()
	db := setupSanctumAdminTestDB(t)
	s := &Server{db: db}
	app := fiber.New()

	owner := models.User{Username: "owner", Email: "o@e.com"}
	db.Create(&owner)
	member := models.User{Username: "member", Email: "m@e.com"}
	db.Create(&member)
	sanctum := models.Sanctum{Name: "The Sanctum", Slug: "sanctum"}
	db.Create(&sanctum)
	room := models.Conversation{Name: "The Sanctum", IsGroup: true, CreatedBy: owner.ID, SanctumID: &sanctum.ID}
	db.Create(&room)
	db.Create(&models.SanctumMembership{SanctumID: sanctum.ID, UserID: owner.ID, Role: models.SanctumMembershipRoleOwner})
	db.Create(&models.SanctumMembership{SanctumID: sanctum.ID, UserID: member.ID, Role: models.SanctumMembershipRoleMember})

	app.Post("/sanctums/:slug/admins/:userId", func(c *fiber.Ctx) error {
		c.Locals("userID", owner.ID)
		return s.PromoteSanctumAdmin(c)
	})

	t.Run("success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sanctums/%s/admins/%d", sanctum.Slug, member.ID), nil)
		resp, _ := app.Test(req)
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
		var membership models.SanctumMembership
		db.Where("sanctum_id = ? AND user_id = ?", sanctum.ID, member.ID).First(&membership)
		if membership.Role != models.SanctumMembershipRoleMod {
			t.Errorf("expected mod role, got %s", membership.Role)
		}

		var roomMod models.ChatroomModerator
		if err := db.Where("conversation_id = ? AND user_id = ?", room.ID, member.ID).First(&roomMod).Error; err != nil {
			t.Fatalf("expected room moderator row: %v", err)
		}
	})
}

func TestDemoteSanctumAdmin(t *testing.T) {
	t.Parallel()
	db := setupSanctumAdminTestDB(t)
	s := &Server{db: db}
	app := fiber.New()

	owner := models.User{Username: "owner", Email: "o@e.com"}
	db.Create(&owner)
	mod := models.User{Username: "mod", Email: "m@e.com"}
	db.Create(&mod)
	sanctum := models.Sanctum{Name: "The Sanctum", Slug: "sanctum"}
	db.Create(&sanctum)
	room := models.Conversation{Name: "The Sanctum", IsGroup: true, CreatedBy: owner.ID, SanctumID: &sanctum.ID}
	db.Create(&room)
	db.Create(&models.SanctumMembership{SanctumID: sanctum.ID, UserID: owner.ID, Role: models.SanctumMembershipRoleOwner})
	db.Create(&models.SanctumMembership{SanctumID: sanctum.ID, UserID: mod.ID, Role: models.SanctumMembershipRoleMod})
	db.Create(&models.ChatroomModerator{ConversationID: room.ID, UserID: mod.ID, GrantedByUserID: owner.ID})

	app.Delete("/sanctums/:slug/admins/:userId", func(c *fiber.Ctx) error {
		c.Locals("userID", owner.ID)
		return s.DemoteSanctumAdmin(c)
	})

	t.Run("success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/sanctums/%s/admins/%d", sanctum.Slug, mod.ID), nil)
		resp, _ := app.Test(req)
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
		var membership models.SanctumMembership
		db.Where("sanctum_id = ? AND user_id = ?", sanctum.ID, mod.ID).First(&membership)
		if membership.Role != models.SanctumMembershipRoleMember {
			t.Errorf("expected member role, got %s", membership.Role)
		}

		var count int64
		if err := db.Model(&models.ChatroomModerator{}).
			Where("conversation_id = ? AND user_id = ?", room.ID, mod.ID).
			Count(&count).Error; err != nil {
			t.Fatalf("count room moderator rows: %v", err)
		}
		if count != 0 {
			t.Fatalf("expected room moderator row removed, count=%d", count)
		}
	})

	t.Run("cannot demote owner", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/sanctums/%s/admins/%d", sanctum.Slug, owner.ID), nil)
		resp, _ := app.Test(req)
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode == http.StatusOK {
			t.Errorf("expected error when demoting owner, got 200")
		}
	})
}
