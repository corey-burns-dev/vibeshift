// Package test contains integration and API tests for the application.
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
	"sanctum/internal/server"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func setupApp() *fiber.App {
	if err := os.Setenv("APP_ENV", "test"); err != nil {
		panic(fmt.Errorf("failed to set env: %w", err))
	}
	if err := os.Setenv("DB_HOST", "postgres_test"); err != nil {
		panic(fmt.Errorf("failed to set DB_HOST env: %w", err))
	}
	if err := os.Setenv("DB_PORT", "5432"); err != nil {
		panic(fmt.Errorf("failed to set DB_PORT env: %w", err))
	}
	cfg, err := config.LoadConfig()
	if err != nil {
		panic(fmt.Errorf("failed to load config: %w", err))
	}
	srv, err := server.NewServer(cfg)
	if err != nil {
		panic(err)
	}
	app := fiber.New()
	srv.SetupMiddleware(app)
	srv.SetupRoutes(app)
	return app
}

func TestHealthCheck(t *testing.T) {
	app := setupApp()

	t.Run("Liveness", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health/live", nil)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)

		var body map[string]string
		err = json.NewDecoder(res.Body).Decode(&body)
		assert.NoError(t, err)
		assert.Equal(t, "up", body["status"])
	})

	t.Run("Readiness", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)

		var body map[string]interface{}
		err = json.NewDecoder(res.Body).Decode(&body)
		assert.NoError(t, err)
		assert.Equal(t, "healthy", body["status"])

		checks := body["checks"].(map[string]interface{})
		assert.Equal(t, "healthy", checks["database"])
		assert.Equal(t, "healthy", checks["redis"])
	})

	t.Run("LegacyHealth", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})
}

func TestSignupAndLogin(t *testing.T) {
	app := setupApp()

	timestamp := time.Now().UnixNano()
	email := fmt.Sprintf("apitestuser_%d@example.com", timestamp)
	username := fmt.Sprintf("test_%d", timestamp)

	// Signup
	body := map[string]string{
		"username": username,
		"email":    email,
		"password": "TestPass123!@#",
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test signup error: %v", err)
	}
	defer func() { _ = res.Body.Close() }()
	assert.Equal(t, 201, res.StatusCode)

	// Login
	loginBody := map[string]string{
		"email":    email,
		"password": "TestPass123!@#",
	}
	b, err = json.Marshal(loginBody)
	if err != nil {
		t.Fatalf("json.Marshal error: %v", err)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	res, err = app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test login error: %v", err)
	}
	defer func() { _ = res.Body.Close() }()
	assert.Equal(t, 200, res.StatusCode)
}

func TestFullAPIFlow(t *testing.T) {
	app := setupApp()

	timestamp := time.Now().UnixNano()
	email := fmt.Sprintf("apitestuser2_%d@example.com", timestamp)
	username := fmt.Sprintf("test2_%d", timestamp)

	// --- Sign Up ---
	signupBody := map[string]string{
		"username": username,
		"email":    email,
		"password": "TestPass123!@#",
	}
	b, _ := json.Marshal(signupBody)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test signup error: %v", err)
	}
	defer func() { _ = res.Body.Close() }()
	assert.Equal(t, 201, res.StatusCode)
	var signupResp struct {
		Token string `json:"token"`
		User  struct {
			ID    uint   `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.NewDecoder(res.Body).Decode(&signupResp); err != nil {
		t.Fatalf("decode signup response: %v", err)
	}
	assert.NotEmpty(t, signupResp.Token)
	userID := signupResp.User.ID
	token := signupResp.Token

	// --- Login ---
	t.Run("Login", func(t *testing.T) {
		loginBody := map[string]string{
			"email":    email,
			"password": "TestPass123!@#",
		}
		b, _ := json.Marshal(loginBody)
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		res, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test login error: %v", err)
		}
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
		var loginResp struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(res.Body).Decode(&loginResp); err != nil {
			t.Fatalf("decode login response: %v", err)
		}
		assert.NotEmpty(t, loginResp.Token)
	})

	// --- Create Post ---
	var postID uint
	t.Run("CreatePost", func(t *testing.T) {
		postBody := map[string]string{
			"title":   "Test Post",
			"content": "This is a test post.",
		}
		b, _ := json.Marshal(postBody)
		req := httptest.NewRequest(http.MethodPost, "/api/posts/", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test create post error: %v", err)
		}
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 201, res.StatusCode)
		var postResp struct {
			ID      uint   `json:"id"`
			Title   string `json:"title"`
			Content string `json:"content"`
		}
		if err := json.NewDecoder(res.Body).Decode(&postResp); err != nil {
			t.Fatalf("decode post response: %v", err)
		}
		assert.Equal(t, "Test Post", postResp.Title)
		postID = postResp.ID
	})

	// --- Like Post ---
	t.Run("LikePost", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/posts/"+itoa(postID)+"/like", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test like post error: %v", err)
		}
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// --- Unlike Post ---
	t.Run("UnlikePost", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/posts/"+itoa(postID)+"/like", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test unlike post error: %v", err)
		}
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// --- Create Comment ---
	t.Run("CreateComment", func(t *testing.T) {
		commentBody := map[string]string{
			"content": "This is a test comment.",
		}
		b, _ := json.Marshal(commentBody)
		req := httptest.NewRequest(http.MethodPost, "/api/posts/"+itoa(postID)+"/comments", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test create comment error: %v", err)
		}
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 201, res.StatusCode)
		var commentResp struct {
			ID      uint   `json:"id"`
			Content string `json:"content"`
		}
		if err := json.NewDecoder(res.Body).Decode(&commentResp); err != nil {
			t.Fatalf("decode comment response: %v", err)
		}
		assert.Equal(t, "This is a test comment.", commentResp.Content)
	})

	// --- Get Comments ---
	t.Run("GetComments", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/posts/"+itoa(postID)+"/comments", nil)
		res, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test get comments error: %v", err)
		}
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// --- Get Posts ---
	t.Run("GetPosts", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/posts/", nil)
		res, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test get posts error: %v", err)
		}
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// --- Get User Profile ---
	t.Run("GetUserProfile", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users/"+itoa(userID), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test get user profile error: %v", err)
		}
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})
}

// Helper for uint to string
func itoa(i uint) string {
	return fmt.Sprintf("%d", i)
}
