//go:build integration

package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAuthSessionLifecycleIntegration(t *testing.T) {
	app := newSanctumTestApp(t)

	timestamp := time.Now().UnixNano()
	email := fmt.Sprintf("session_%d@example.com", timestamp)
	username := fmt.Sprintf("session_%d", timestamp)

	signupBody := map[string]string{
		"username": username,
		"email":    email,
		"password": "TestPass123!@#",
	}
	signupJSON, _ := json.Marshal(signupBody)

	signupReq := httptest.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewReader(signupJSON))
	signupReq.Header.Set("Content-Type", "application/json")
	signupResp, err := app.Test(signupReq, -1)
	if err != nil {
		t.Fatalf("signup request failed: %v", err)
	}
	defer func() { _ = signupResp.Body.Close() }()

	if signupResp.StatusCode != http.StatusCreated {
		t.Fatalf("signup expected %d got %d", http.StatusCreated, signupResp.StatusCode)
	}

	var signupData struct {
		Token        string `json:"token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(signupResp.Body).Decode(&signupData); err != nil {
		t.Fatalf("decode signup response: %v", err)
	}
	if signupData.Token == "" || signupData.RefreshToken == "" {
		t.Fatalf("signup response missing tokens: %+v", signupData)
	}

	refreshReqBody, _ := json.Marshal(map[string]string{
		"refresh_token": signupData.RefreshToken,
	})
	refreshReq := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", bytes.NewReader(refreshReqBody))
	refreshReq.Header.Set("Content-Type", "application/json")
	refreshResp, err := app.Test(refreshReq, -1)
	if err != nil {
		t.Fatalf("refresh request failed: %v", err)
	}
	defer func() { _ = refreshResp.Body.Close() }()

	if refreshResp.StatusCode != http.StatusOK {
		t.Fatalf("refresh expected %d got %d", http.StatusOK, refreshResp.StatusCode)
	}

	var refreshData struct {
		Token        string `json:"token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(refreshResp.Body).Decode(&refreshData); err != nil {
		t.Fatalf("decode refresh response: %v", err)
	}
	if refreshData.Token == "" || refreshData.RefreshToken == "" {
		t.Fatalf("refresh response missing tokens: %+v", refreshData)
	}
	if refreshData.RefreshToken == signupData.RefreshToken {
		t.Fatal("expected refresh token rotation, but refresh token did not change")
	}

	// Reusing an already-rotated refresh token must fail.
	reuseReq := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", bytes.NewReader(refreshReqBody))
	reuseReq.Header.Set("Content-Type", "application/json")
	reuseResp, err := app.Test(reuseReq, -1)
	if err != nil {
		t.Fatalf("reuse refresh request failed: %v", err)
	}
	defer func() { _ = reuseResp.Body.Close() }()

	if reuseResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("refresh token reuse expected %d got %d", http.StatusUnauthorized, reuseResp.StatusCode)
	}

	// Logout should revoke refresh token and blacklist current access token.
	logoutReqBody, _ := json.Marshal(map[string]string{
		"refresh_token": refreshData.RefreshToken,
	})
	logoutReq := httptest.NewRequest(http.MethodPost, "/api/auth/logout", bytes.NewReader(logoutReqBody))
	logoutReq.Header.Set("Content-Type", "application/json")
	logoutReq.Header.Set("Authorization", "Bearer "+refreshData.Token)
	logoutResp, err := app.Test(logoutReq, -1)
	if err != nil {
		t.Fatalf("logout request failed: %v", err)
	}
	defer func() { _ = logoutResp.Body.Close() }()

	if logoutResp.StatusCode != http.StatusOK {
		t.Fatalf("logout expected %d got %d", http.StatusOK, logoutResp.StatusCode)
	}

	// Access token should no longer authorize protected routes.
	meReq := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+refreshData.Token)
	meResp, err := app.Test(meReq, -1)
	if err != nil {
		t.Fatalf("users/me request failed: %v", err)
	}
	defer func() { _ = meResp.Body.Close() }()

	if meResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("revoked access token expected %d got %d", http.StatusUnauthorized, meResp.StatusCode)
	}

	// Logged-out refresh token should not be accepted.
	loggedOutRefreshReq := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", bytes.NewReader(logoutReqBody))
	loggedOutRefreshReq.Header.Set("Content-Type", "application/json")
	loggedOutRefreshResp, err := app.Test(loggedOutRefreshReq, -1)
	if err != nil {
		t.Fatalf("logged out refresh request failed: %v", err)
	}
	defer func() { _ = loggedOutRefreshResp.Body.Close() }()

	if loggedOutRefreshResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("logged out refresh token expected %d got %d", http.StatusUnauthorized, loggedOutRefreshResp.StatusCode)
	}
}
