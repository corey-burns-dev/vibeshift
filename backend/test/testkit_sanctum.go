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

	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/server"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type authUser struct {
	ID    uint
	Token string
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

	srv, err := server.NewServer(cfg)
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	app := fiber.New()
	srv.SetupMiddleware(app)
	srv.SetupRoutes(app)
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
			ID uint `json:"id"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode signup response: %v", err)
	}

	if body.Token == "" || body.User.ID == 0 {
		t.Fatalf("invalid signup response: %+v", body)
	}

	return authUser{ID: body.User.ID, Token: body.Token}
}

func makeSanctumAdmin(t *testing.T, userID uint) {
	t.Helper()
	if err := database.DB.Exec(`UPDATE users SET is_admin = TRUE WHERE id = ?`, userID).Error; err != nil {
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
