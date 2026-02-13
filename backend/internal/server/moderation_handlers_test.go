package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"sanctum/internal/models"
	"sanctum/internal/service"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupModerationTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.UserBlock{},
		&models.ModerationReport{},
		&models.Post{},
		&models.Comment{},
		&models.ChatroomMute{},
	); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	return db
}

func TestGetMyBlocks(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	user := models.User{Username: "user", Email: "u1@e.com", Password: "pw"}
	db.Create(&user)
	blocked := models.User{Username: "blocked", Email: "b1@e.com", Password: "pw"}
	db.Create(&blocked)

	app.Get("/blocks/me", func(c *fiber.Ctx) error {
		c.Locals("userID", user.ID)
		return s.GetMyBlocks(c)
	})

	t.Run("empty list", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/blocks/me", nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
		var blocks []models.UserBlock
		json.NewDecoder(resp.Body).Decode(&blocks)
		if len(blocks) != 0 {
			t.Errorf("expected 0 blocks, got %d", len(blocks))
		}
	})

	t.Run("with blocks", func(t *testing.T) {
		db.Create(&models.UserBlock{BlockerID: user.ID, BlockedID: blocked.ID})
		req := httptest.NewRequest(http.MethodGet, "/blocks/me", nil)
		resp, _ := app.Test(req)
		var blocks []models.UserBlock
		json.NewDecoder(resp.Body).Decode(&blocks)
		if len(blocks) != 1 {
			t.Errorf("expected 1 block, got %d", len(blocks))
		}
	})
}

func TestBlockUser(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	user := models.User{Username: "user", Email: "u2@e.com", Password: "pw"}
	db.Create(&user)
	target := models.User{Username: "target", Email: "t2@e.com", Password: "pw"}
	db.Create(&target)

	app.Post("/users/:id/block", func(c *fiber.Ctx) error {
		c.Locals("userID", user.ID)
		return s.BlockUser(c)
	})

	t.Run("success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/users/%d/block", target.ID), nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
		var block models.UserBlock
		if err := db.Where("blocker_id = ? AND blocked_id = ?", user.ID, target.ID).First(&block).Error; err != nil {
			t.Errorf("block record not created: %v", err)
		}
	})

	t.Run("self-block prevention", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/users/%d/block", user.ID), nil)
		resp, _ := app.Test(req)
		if resp.StatusCode == http.StatusOK {
			t.Errorf("expected error, got 200")
		}
	})
}

func TestUnblockUser(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	user := models.User{Username: "user", Email: "u3@e.com", Password: "pw"}
	db.Create(&user)
	target := models.User{Username: "target", Email: "t3@e.com", Password: "pw"}
	db.Create(&target)
	db.Create(&models.UserBlock{BlockerID: user.ID, BlockedID: target.ID})

	app.Delete("/users/:id/block", func(c *fiber.Ctx) error {
		c.Locals("userID", user.ID)
		return s.UnblockUser(c)
	})

	t.Run("success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/users/%d/block", target.ID), nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
		var count int64
		db.Model(&models.UserBlock{}).Where("blocker_id = ? AND blocked_id = ?", user.ID, target.ID).Count(&count)
		if count != 0 {
			t.Errorf("block record still exists")
		}
	})
}

func TestReportUser(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	reporter := models.User{Username: "reporter", Email: "r4@e.com", Password: "pw"}
	db.Create(&reporter)
	target := models.User{Username: "target", Email: "t4@e.com", Password: "pw"}
	db.Create(&target)

	app.Post("/users/:id/report", func(c *fiber.Ctx) error {
		c.Locals("userID", reporter.ID)
		return s.ReportUser(c)
	})

	t.Run("success", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"reason": "harassment"})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/users/%d/report", target.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
			t.Errorf("expected success, got %d", resp.StatusCode)
		}
	})
}

func TestReportPost(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	reporter := models.User{Username: "reporter", Email: "r5@e.com", Password: "pw"}
	db.Create(&reporter)
	author := models.User{Username: "author", Email: "a5@e.com", Password: "pw"}
	db.Create(&author)
	post := models.Post{Content: "bad post", UserID: author.ID}
	db.Create(&post)

	app.Post("/posts/:id/report", func(c *fiber.Ctx) error {
		c.Locals("userID", reporter.ID)
		return s.ReportPost(c)
	})

	t.Run("success", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"reason": "spam"})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/posts/%d/report", post.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
			t.Errorf("expected success, got %d", resp.StatusCode)
		}
	})
}

func TestGetAdminReports(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	admin := models.User{Username: "admin", IsAdmin: true, Email: "admin@e.com"}
	db.Create(&admin)
	db.Create(&models.ModerationReport{ReporterID: 1, TargetType: "user", TargetID: 2, Reason: "spam", Status: "open"})

	app.Get("/admin/reports", func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return s.GetAdminReports(c)
	})

	t.Run("list all", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/reports", nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})
}

func TestResolveAdminReport(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	admin := models.User{Username: "admin", IsAdmin: true, Email: "admin2@e.com"}
	db.Create(&admin)
	report := models.ModerationReport{ReporterID: 1, TargetType: "user", TargetID: 2, Reason: "spam", Status: "open"}
	db.Create(&report)

	app.Post("/admin/reports/:id/resolve", func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return s.ResolveAdminReport(c)
	})

	t.Run("success", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"status": "resolved", "resolution_notes": "taken care of"})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/admin/reports/%d/resolve", report.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})
}

func TestGetAdminBanRequests(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	admin := models.User{Username: "admin", IsAdmin: true, Email: "admin3@e.com"}
	db.Create(&admin)
	// Create multiple reports for same user to test aggregation if the handler does that
	db.Create(&models.ModerationReport{ReporterID: 1, TargetType: "user", TargetID: 10, Reason: "spam", Status: "open"})
	db.Create(&models.ModerationReport{ReporterID: 2, TargetType: "user", TargetID: 10, Reason: "harassment", Status: "open"})

	app.Get("/admin/ban-requests", func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return s.GetAdminBanRequests(c)
	})

	t.Run("success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/ban-requests", nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})
}

func TestGetAdminUsers(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	admin := models.User{Username: "admin", IsAdmin: true, Email: "admin4@e.com"}
	db.Create(&admin)
	db.Create(&models.User{Username: "target_user", Email: "t4@u.com"})

	app.Get("/admin/users", func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return s.GetAdminUsers(c)
	})

	t.Run("list with filter", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/users?q=target", nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("validation error - query too long", func(t *testing.T) {
		longQ := "this_is_a_very_long_search_query_that_exceeds_sixty_four_characters_limit_1234567890"
		req := httptest.NewRequest(http.MethodGet, "/admin/users?q="+longQ, nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", resp.StatusCode)
		}
	})
}

func TestBanUser(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	admin := models.User{Username: "admin", IsAdmin: true, Email: "admin5@e.com"}
	db.Create(&admin)
	target := models.User{Username: "target", Email: "t5@e.com"}
	db.Create(&target)

	app.Post("/admin/users/:id/ban", func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return s.BanUser(c)
	})

	t.Run("success", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"reason": "bad behavior", "expires_at": ""})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/admin/users/%d/ban", target.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
		var updatedTarget models.User
		db.First(&updatedTarget, target.ID)
		if !updatedTarget.IsBanned {
			t.Errorf("user should be banned")
		}
	})

	t.Run("self-ban prevention", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/admin/users/%d/ban", admin.ID), nil)
		resp, _ := app.Test(req)
		if resp.StatusCode == http.StatusOK {
			t.Errorf("expected error, got 200")
		}
	})
}

func TestUnbanUser(t *testing.T) {
	t.Parallel()
	db := setupModerationTestDB(t)
	s := &Server{
		db:                db,
		moderationService: service.NewModerationService(db),
	}
	app := fiber.New()

	admin := models.User{Username: "admin", IsAdmin: true, Email: "admin6@e.com"}
	db.Create(&admin)
	target := models.User{Username: "target", IsBanned: true, Email: "t6@e.com"}
	db.Create(&target)

	app.Post("/admin/users/:id/unban", func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return s.UnbanUser(c)
	})

	t.Run("success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/admin/users/%d/unban", target.ID), nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", resp.StatusCode)
		}
		var updatedTarget models.User
		db.First(&updatedTarget, target.ID)
		if updatedTarget.IsBanned {
			t.Errorf("user should be unbanned")
		}
	})
}
