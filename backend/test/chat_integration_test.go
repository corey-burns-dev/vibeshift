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

type TestUser struct {
	ID    uint
	Token string
}

func createTestUser(t *testing.T, app interface {
	Test(req *http.Request, msTimeout ...int) (*http.Response, error)
}, username, email string,
) TestUser {
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
	if res.StatusCode != 201 {
		buf := new(bytes.Buffer)
		_, _ = buf.ReadFrom(res.Body)
		t.Fatalf("expected 201, got %d. Body: %s", res.StatusCode, buf.String())
	}

	var resp struct {
		Token string `json:"token"`
		User  struct {
			ID uint `json:"id"`
		} `json:"user"`
	}
	_ = json.NewDecoder(res.Body).Decode(&resp)
	return TestUser{ID: resp.User.ID, Token: resp.Token}
}

func TestChatAPI(t *testing.T) {
	app := setupApp()

	timestamp := time.Now().UnixNano()
	user1 := createTestUser(t, app, fmt.Sprintf("u1_%d", timestamp), fmt.Sprintf("u1_%d@e.com", timestamp))
	user2 := createTestUser(t, app, fmt.Sprintf("u2_%d", timestamp), fmt.Sprintf("u2_%d@e.com", timestamp))
	user3 := createTestUser(t, app, fmt.Sprintf("u3_%d", timestamp), fmt.Sprintf("u3_%d@e.com", timestamp))

	var convID uint

	t.Run("Create 1-on-1 Conversation", func(t *testing.T) {
		body := map[string]interface{}{
			"participant_ids": []uint{user2.ID},
			"is_group":        false,
		}
		b, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPost, "/api/conversations", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+user1.Token)

		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		assert.Equal(t, 201, res.StatusCode)
		defer func() { _ = res.Body.Close() }()

		var resp struct {
			ID uint `json:"id"`
		}
		_ = json.NewDecoder(res.Body).Decode(&resp)
		convID = resp.ID
		assert.NotZero(t, convID)
	})

	t.Run("Send Message", func(t *testing.T) {
		body := map[string]string{
			"content":      "Hello",
			"message_type": "text",
		}
		b, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/conversations/%d/messages", convID), bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+user1.Token)

		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		assert.Equal(t, 201, res.StatusCode)
		_ = res.Body.Close()
	})

	t.Run("Get Messages", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/conversations/%d/messages", convID), nil)
		req.Header.Set("Authorization", "Bearer "+user2.Token)

		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		assert.Equal(t, 200, res.StatusCode)
		defer func() { _ = res.Body.Close() }()

		var messages []map[string]interface{}
		_ = json.NewDecoder(res.Body).Decode(&messages)
		assert.Greater(t, len(messages), 0)
		assert.Equal(t, "Hello", messages[0]["content"])
	})

	t.Run("Create Group Chat", func(t *testing.T) {
		body := map[string]interface{}{
			"participant_ids": []uint{user1.ID, user2.ID},
			"is_group":        true,
			"name":            "Group 1",
		}
		b, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPost, "/api/conversations", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+user3.Token)

		res, err := app.Test(req, -1)
		assert.NoError(t, err)
		assert.Equal(t, 201, res.StatusCode)
		defer func() { _ = res.Body.Close() }()

		var resp struct {
			Name string `json:"name"`
		}
		_ = json.NewDecoder(res.Body).Decode(&resp)
		assert.Equal(t, "Group 1", resp.Name)
	})
}
