package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupSanctumHandlerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.Conversation{},
		&models.Sanctum{},
		&models.SanctumRequest{},
		&models.SanctumMembership{},
	); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	return db
}

func TestApproveSanctumRequestFlow(t *testing.T) {
	t.Parallel()

	db := setupSanctumHandlerTestDB(t)
	s := &Server{db: db}

	requester := models.User{Username: "requester", Email: "requester@example.com", Password: "pw", IsAdmin: false}
	admin := models.User{Username: "admin", Email: "admin@example.com", Password: "pw", IsAdmin: true}
	if err := db.Create(&requester).Error; err != nil {
		t.Fatalf("create requester: %v", err)
	}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}

	req := models.SanctumRequest{
		RequestedName:     "The Workshop",
		RequestedSlug:     "workshop",
		Reason:            "for builders",
		RequestedByUserID: requester.ID,
		Status:            models.SanctumRequestStatusPending,
	}
	if err := db.Create(&req).Error; err != nil {
		t.Fatalf("create request: %v", err)
	}

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return c.Next()
	})
	app.Post("/admin/sanctum-requests/:id/approve", s.ApproveSanctumRequest)

	body := []byte(`{"review_notes":"approved"}`)
	httpReq := httptest.NewRequest(http.MethodPost, "/admin/sanctum-requests/1/approve", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(httpReq)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var updatedReq models.SanctumRequest
	if err := db.First(&updatedReq, req.ID).Error; err != nil {
		t.Fatalf("reload request: %v", err)
	}
	if updatedReq.Status != models.SanctumRequestStatusApproved {
		t.Fatalf("expected approved status, got %s", updatedReq.Status)
	}
	if updatedReq.ReviewedByUserID == nil || *updatedReq.ReviewedByUserID != admin.ID {
		t.Fatalf("expected reviewer %d", admin.ID)
	}

	var sanctum models.Sanctum
	if err := db.Where("slug = ?", "workshop").First(&sanctum).Error; err != nil {
		t.Fatalf("sanctum missing: %v", err)
	}

	var membership models.SanctumMembership
	if err := db.Where("sanctum_id = ? AND user_id = ?", sanctum.ID, requester.ID).First(&membership).Error; err != nil {
		t.Fatalf("owner membership missing: %v", err)
	}
	if membership.Role != models.SanctumMembershipRoleOwner {
		t.Fatalf("expected owner role, got %s", membership.Role)
	}

	var conv models.Conversation
	if err := db.Where("sanctum_id = ?", sanctum.ID).First(&conv).Error; err != nil {
		t.Fatalf("default conversation missing: %v", err)
	}
}

func TestApproveSanctumRequest_NonPendingFails(t *testing.T) {
	t.Parallel()

	db := setupSanctumHandlerTestDB(t)
	s := &Server{db: db}

	requester := models.User{Username: "requester2", Email: "requester2@example.com", Password: "pw", IsAdmin: false}
	admin := models.User{Username: "admin2", Email: "admin2@example.com", Password: "pw", IsAdmin: true}
	_ = db.Create(&requester)
	_ = db.Create(&admin)
	request := models.SanctumRequest{
		RequestedName:     "The Yard",
		RequestedSlug:     "yard",
		Reason:            "reason",
		RequestedByUserID: requester.ID,
		Status:            models.SanctumRequestStatusApproved,
	}
	_ = db.Create(&request)

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return c.Next()
	})
	app.Post("/admin/sanctum-requests/:id/approve", s.ApproveSanctumRequest)

	httpReq := httptest.NewRequest(http.MethodPost, "/admin/sanctum-requests/1/approve", nil)
	resp, err := app.Test(httpReq)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestApproveSanctumRequest_ReservedSlugFails(t *testing.T) {
	t.Parallel()

	db := setupSanctumHandlerTestDB(t)
	s := &Server{db: db}

	requester := models.User{Username: "requester3", Email: "requester3@example.com", Password: "pw", IsAdmin: false}
	admin := models.User{Username: "admin3", Email: "admin3@example.com", Password: "pw", IsAdmin: true}
	_ = db.Create(&requester)
	_ = db.Create(&admin)
	request := models.SanctumRequest{
		RequestedName:     "Admin Spot",
		RequestedSlug:     "admin",
		Reason:            "reason",
		RequestedByUserID: requester.ID,
		Status:            models.SanctumRequestStatusPending,
	}
	_ = db.Create(&request)

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return c.Next()
	})
	app.Post("/admin/sanctum-requests/:id/approve", s.ApproveSanctumRequest)

	httpReq := httptest.NewRequest(http.MethodPost, "/admin/sanctum-requests/1/approve", nil)
	resp, err := app.Test(httpReq)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestApproveSanctumRequest_TakenSlugFails(t *testing.T) {
	t.Parallel()

	db := setupSanctumHandlerTestDB(t)
	s := &Server{db: db}

	requester := models.User{Username: "requester4", Email: "requester4@example.com", Password: "pw", IsAdmin: false}
	admin := models.User{Username: "admin4", Email: "admin4@example.com", Password: "pw", IsAdmin: true}
	_ = db.Create(&requester)
	_ = db.Create(&admin)
	_ = db.Create(&models.Sanctum{Name: "Existing", Slug: "taken", Description: "x", Status: models.SanctumStatusActive})
	request := models.SanctumRequest{
		RequestedName:     "Taken",
		RequestedSlug:     "taken",
		Reason:            "reason",
		RequestedByUserID: requester.ID,
		Status:            models.SanctumRequestStatusPending,
	}
	_ = db.Create(&request)

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", admin.ID)
		return c.Next()
	})
	app.Post("/admin/sanctum-requests/:id/approve", s.ApproveSanctumRequest)

	httpReq := httptest.NewRequest(http.MethodPost, "/admin/sanctum-requests/1/approve", nil)
	resp, err := app.Test(httpReq)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}

	var response map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&response)
}
