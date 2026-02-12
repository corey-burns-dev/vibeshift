package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"sanctum/internal/bootstrap"
	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/seed"
	"sanctum/internal/server"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type authUser struct {
	ID    uint
	Token string
	Email string
}

func newSanctumTestApp(t *testing.T) *fiber.App {
	t.Helper()

	if err := os.Setenv("APP_ENV", "test"); err != nil {
		t.Fatalf("set APP_ENV: %v", err)
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	// Initialize runtime (DB + Redis). Tests explicitly enable built-in seeding
	// so existing integration-style tests continue to observe built-ins.
	db, redisClient, err := bootstrap.InitRuntime(cfg, bootstrap.Options{SeedBuiltIns: true})
	if err != nil {
		t.Fatalf("bootstrap init runtime: %v", err)
	}

	// Create server from existing deps (no implicit seeding)
	srv, err := server.NewServerWithDeps(cfg, db, redisClient)
	if err != nil {
		t.Fatalf("new server with deps: %v", err)
	}

	app := fiber.New()
	srv.SetupMiddleware(app)
	srv.SetupRoutes(app)
	return app
}

// newSanctumTestAppWithDB returns a test Fiber app and the initialized *gorm.DB
// instance returned by the bootstrap initializer. Use this when a test needs
// explicit access to the DB for seeding or direct queries.
func newSanctumTestAppWithDB(t *testing.T) (*fiber.App, *gorm.DB) {
	t.Helper()

	if err := os.Setenv("APP_ENV", "test"); err != nil {
		t.Fatalf("set APP_ENV: %v", err)
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	db, redisClient, err := bootstrap.InitRuntime(cfg, bootstrap.Options{SeedBuiltIns: true})
	if err != nil {
		t.Fatalf("bootstrap init runtime: %v", err)
	}

	srv, err := server.NewServerWithDeps(cfg, db, redisClient)
	if err != nil {
		t.Fatalf("new server with deps: %v", err)
	}

	app := fiber.New()
	srv.SetupMiddleware(app)
	srv.SetupRoutes(app)
	return app, db
}

// newSanctumTestAppWithSeeding creates a test app and seeds built-in sanctums.
func newSanctumTestAppWithSeeding(t *testing.T) *fiber.App {
	t.Helper()
	app := newSanctumTestApp(t)

	// Seed built-in sanctums using the package-level DB from bootstrap
	if err := seed.Sanctums(database.DB); err != nil {
		t.Fatalf("seed sanctums: %v", err)
	}

	return app
}

func signupSanctumUser(t *testing.T, app *fiber.App, prefix string) authUser {
	t.Helper()

	suffix := time.Now().UnixNano()
	username := "u" + uuid.NewString()[:10]
	email := fmt.Sprintf("%s_%d@example.com", prefix, suffix)

	payload := map[string]string{
		"username": username,
		"email":    email,
		"password": "TestPass123!@#",
	}

	req := jsonReq(t, http.MethodPost, "/api/auth/signup", payload)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("signup app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("signup expected 201 got %d", resp.StatusCode)
	}

	var body struct {
		Token string `json:"token"`
		User  struct {
			ID    uint   `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode signup response: %v", err)
	}

	if body.Token == "" || body.User.ID == 0 {
		t.Fatalf("invalid signup response: %+v", body)
	}

	return authUser{ID: body.User.ID, Token: body.Token, Email: body.User.Email}
}

// makeSanctumAdminWithDB promotes a user to admin using the provided DB instance.
func makeSanctumAdminWithDB(t *testing.T, db *gorm.DB, userID uint) {
	t.Helper()
	if err := db.Exec(`UPDATE users SET is_admin = TRUE WHERE id = ?`, userID).Error; err != nil {
		t.Fatalf("promote user to admin: %v", err)
	}
}

func jsonReq(t *testing.T, method, path string, payload any) *http.Request {
	t.Helper()
	if payload == nil {
		return httptest.NewRequest(method, path, nil)
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func authReq(t *testing.T, method, path, token string, payload any) *http.Request {
	t.Helper()
	req := jsonReq(t, method, path, payload)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

func uniqueSanctumSlug(prefix string) string {
	return fmt.Sprintf("%s-%s", prefix, uuid.NewString()[:8])
}

// itoa converts uint to string for URL path segments.
func itoa(i uint) string {
	return fmt.Sprintf("%d", i)
}
