//go:build integration

package test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFriendEndpoints(t *testing.T) {
	app := newSanctumTestApp(t)

	u1 := signupSanctumUser(t, app, "friend1")
	u2 := signupSanctumUser(t, app, "friend2")
	u3 := signupSanctumUser(t, app, "friend3")
	token1, token2, token3 := u1.Token, u2.Token, u3.Token
	id2, id3 := u2.ID, u3.ID

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
}
