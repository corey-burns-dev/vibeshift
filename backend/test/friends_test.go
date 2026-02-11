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

func TestFriendEndpoints(t *testing.T) {
	app := setupApp()
	timestamp := time.Now().UnixNano()

	// Create User 1
	username1 := fmt.Sprintf("friend1_%d", timestamp)
	email1 := fmt.Sprintf("friend1_%d@example.com", timestamp)
	token1, _ := registerUser(t, app, username1, email1)

	// Create User 2
	username2 := fmt.Sprintf("friend2_%d", timestamp)
	email2 := fmt.Sprintf("friend2_%d@example.com", timestamp)
	token2, id2 := registerUser(t, app, username2, email2)

	// Create User 3
	username3 := fmt.Sprintf("friend3_%d", timestamp)
	email3 := fmt.Sprintf("friend3_%d@example.com", timestamp)
	token3, id3 := registerUser(t, app, username3, email3)

	var requestID uint

	// Send Friend Request (User 1 -> User 2)
	t.Run("SendFriendRequest", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/friends/requests/"+itoa(id2), nil)
		req.Header.Set("Authorization", "Bearer "+token1)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 201, res.StatusCode)

		var resp struct {
			ID uint `json:"id"`
		}
		_ = json.NewDecoder(res.Body).Decode(&resp)
		requestID = resp.ID
	})

	// Get Sent Requests (User 1)
	t.Run("GetSentRequests", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/friends/requests/sent", nil)
		req.Header.Set("Authorization", "Bearer "+token1)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// Get Pending Requests (User 2)
	t.Run("GetPendingRequests", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/friends/requests", nil)
		req.Header.Set("Authorization", "Bearer "+token2)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// Accept Friend Request (User 2 accepts User 1)
	t.Run("AcceptFriendRequest", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/friends/requests/"+itoa(requestID)+"/accept", nil)
		req.Header.Set("Authorization", "Bearer "+token2)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// Get Friends (User 1 should see User 2)
	t.Run("GetFriends", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/friends", nil)
		req.Header.Set("Authorization", "Bearer "+token1)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 200, res.StatusCode)
	})

	// Reject Friend Request (User 1 -> User 3, User 3 rejects)
	t.Run("RejectFriendRequest", func(t *testing.T) {
		// Send request User 1 -> User 3
		req := httptest.NewRequest(http.MethodPost, "/api/friends/requests/"+itoa(id3), nil)
		req.Header.Set("Authorization", "Bearer "+token1)
		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 201, res.StatusCode)

		var resp struct {
			ID uint `json:"id"`
		}
		_ = json.NewDecoder(res.Body).Decode(&resp)
		requestID := resp.ID

		// User 3 rejects
		req = httptest.NewRequest(http.MethodPost, "/api/friends/requests/"+itoa(requestID)+"/reject", nil)
		req.Header.Set("Authorization", "Bearer "+token3)
		res, err = app.Test(req, -1)
		assert.NoError(t, err)
		defer func() { _ = res.Body.Close() }()
		assert.Equal(t, 204, res.StatusCode)
	})

	// Let's get User 3's ID properly in `registerUser` helper
}

// Helper to register user and return token + ID
func registerUser(t *testing.T, app interface {
	Test(req *http.Request, msTimeout ...int) (*http.Response, error)
}, username, email string,
) (string, uint) {
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
		t.Fatalf("signup error: %v", err)
	}
	defer func() { _ = res.Body.Close() }()
	assert.Equal(t, 201, res.StatusCode)

	var signupResp struct {
		Token string `json:"token"`
		User  struct {
			ID uint `json:"id"`
		} `json:"user"`
	}
	_ = json.NewDecoder(res.Body).Decode(&signupResp)
	return signupResp.Token, signupResp.User.ID
}
