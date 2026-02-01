package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestUserEndpoints(t *testing.T) {
	app := setupApp()
	timestamp := time.Now().UnixNano()
	username := fmt.Sprintf("user_%d", timestamp)
	email := fmt.Sprintf("user_%d@example.com", timestamp)

	// Signup
	signupBody := map[string]string{
		"username": username,
		"email":    email,
		"password": "TestPass123!@#",
	}
	b, _ := json.Marshal(signupBody)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req, -1)
	assert.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	assert.Equal(t, 201, res.StatusCode)

	var signupResp struct {
		Token string `json:"token"`
		User  struct {
			ID    uint   `json:"id"`
			Email string `json:"email"`
			Bio   string `json:"bio"`
		} `json:"user"`
	}
	_ = json.NewDecoder(res.Body).Decode(&signupResp)
	token := signupResp.Token

	// Get Me
	t.Run("GetMe", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// Update Me
	t.Run("UpdateMe", func(t *testing.T) {
		updateBody := map[string]string{
			"bio": "Updated bio",
		}
		b, _ := json.Marshal(updateBody)
		req := httptest.NewRequest(http.MethodPut, "/api/users/me", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)

		var updateResp struct {
			Bio string `json:"bio"`
		}
		_ = json.NewDecoder(res.Body).Decode(&updateResp)
		assert.Equal(t, "Updated bio", updateResp.Bio)
	})
}

func TestPostCRUDEndpoints(t *testing.T) {
	app := setupApp()
	timestamp := time.Now().UnixNano()
	username := fmt.Sprintf("poster_%d", timestamp)
	email := fmt.Sprintf("poster_%d@example.com", timestamp)

	// Signup
	signupBody := map[string]string{
		"username": username,
		"email":    email,
		"password": "TestPass123!@#",
	}
	b, _ := json.Marshal(signupBody)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req, -1)
	assert.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	assert.Equal(t, 201, res.StatusCode)
	token := ""
	var signupResp struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(res.Body).Decode(&signupResp)
	token = signupResp.Token

	var postID uint

	// Create Post
	t.Run("CreatePost", func(t *testing.T) {
		postBody := map[string]string{
			"title":   "CRUD Post",
			"content": "Original Content",
		}
		b, _ := json.Marshal(postBody)
		req := httptest.NewRequest(http.MethodPost, "/api/posts/", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 201, res.StatusCode)

		var postResp struct {
			ID uint `json:"id"`
		}
		_ = json.NewDecoder(res.Body).Decode(&postResp)
		postID = postResp.ID
	})

	// Get Post
	t.Run("GetPost", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/posts/"+itoa(postID), nil)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// Update Post
	t.Run("UpdatePost", func(t *testing.T) {
		updateBody := map[string]string{
			"title":   "Updated CRUD Post",
			"content": "Updated Content",
		}
		b, _ := json.Marshal(updateBody)
		req := httptest.NewRequest(http.MethodPut, "/api/posts/"+itoa(postID), bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)

		var updateResp struct {
			Title string `json:"title"`
		}
		_ = json.NewDecoder(res.Body).Decode(&updateResp)
		assert.Equal(t, "Updated CRUD Post", updateResp.Title)
	})

	// Delete Post
	t.Run("DeletePost", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/posts/"+itoa(postID), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 204, res.StatusCode) // Assuming 204 No Content for delete
	})

	// Verify Deleted
	t.Run("VerifyDeleted", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/posts/"+itoa(postID), nil)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 404, res.StatusCode)
	})
}
