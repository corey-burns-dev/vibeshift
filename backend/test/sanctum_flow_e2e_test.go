package test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"sanctum/internal/models"
)

func TestSanctumRequestApprovalAndPostingFlow(t *testing.T) {
	app := newSanctumTestApp(t)

	// 1. Create users: one requester and one admin
	requester := signupSanctumUser(t, app, "requester")
	admin := signupSanctumUser(t, app, "admin_user")
	makeSanctumAdmin(t, admin.ID)

	// 2. Requester submits a sanctum request
	reqSlug := uniqueSanctumSlug("flow-test")
	requestPayload := map[string]string{
		"requested_name": "Flow Test Sanctum",
		"requested_slug": reqSlug,
		"reason":         "Testing the full end-to-end flow",
	}

	createReq := authReq(t, http.MethodPost, "/api/sanctums/requests", requester.Token, requestPayload)
	createResp, err := app.Test(createReq, -1)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", createResp.StatusCode)
	}

	var sanctumReq models.SanctumRequest
	if err := json.NewDecoder(createResp.Body).Decode(&sanctumReq); err != nil {
		t.Fatalf("decode request response: %v", err)
	}
	_ = createResp.Body.Close()

	// 3. Admin views pending requests
	adminGetReq := authReq(t, http.MethodGet, "/api/admin/sanctum-requests?status=pending", admin.Token, nil)
	adminGetResp, err := app.Test(adminGetReq, -1)
	if err != nil {
		t.Fatalf("admin get requests: %v", err)
	}
	if adminGetResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", adminGetResp.StatusCode)
	}

	var pendingRequests []models.SanctumRequest
	if err := json.NewDecoder(adminGetResp.Body).Decode(&pendingRequests); err != nil {
		t.Fatalf("decode admin requests: %v", err)
	}
	_ = adminGetResp.Body.Close()

	found := false
	for _, r := range pendingRequests {
		if r.ID == sanctumReq.ID {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("created request ID %d not found in admin pending list", sanctumReq.ID)
	}

	// 4. Admin approves the request
	approvePath := fmt.Sprintf("/api/admin/sanctum-requests/%d/approve", sanctumReq.ID)
	approvePayload := map[string]string{"review_notes": "Looks good to me!"}
	approveReq := authReq(t, http.MethodPost, approvePath, admin.Token, approvePayload)
	approveResp, err := app.Test(approveReq, -1)
	if err != nil {
		t.Fatalf("approve request: %v", err)
	}
	if approveResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", approveResp.StatusCode)
	}

	var approveResult struct {
		Request models.SanctumRequest `json:"request"`
		Sanctum struct {
			ID                uint   `json:"id"`
			Slug              string `json:"slug"`
			DefaultChatRoomID *uint  `json:"default_chat_room_id"`
		} `json:"sanctum"`
	}
	if err := json.NewDecoder(approveResp.Body).Decode(&approveResult); err != nil {
		t.Fatalf("decode approve response: %v", err)
	}
	_ = approveResp.Body.Close()

	if approveResult.Request.Status != models.SanctumRequestStatusApproved {
		t.Errorf("expected status approved, got %s", approveResult.Request.Status)
	}
	if approveResult.Sanctum.Slug != reqSlug {
		t.Errorf("expected sanctum slug %s, got %s", reqSlug, approveResult.Sanctum.Slug)
	}

	// 5. User seeds a post to the new sanctum
	postPayload := map[string]any{
		"title":       "First Post in New Sanctum",
		"content":     "Hello world from my new sanctum!",
		"sanctum_id":  approveResult.Sanctum.ID,
	}
	createPostReq := authReq(t, http.MethodPost, "/api/posts", requester.Token, postPayload)
	createPostResp, err := app.Test(createPostReq, -1)
	if err != nil {
		t.Fatalf("create post: %v", err)
	}
	if createPostResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created for post, got %d", createPostResp.StatusCode)
	}

	var createdPost models.Post
	if err := json.NewDecoder(createPostResp.Body).Decode(&createdPost); err != nil {
		t.Fatalf("decode post response: %v", err)
	}
	_ = createPostResp.Body.Close()

	if createdPost.SanctumID == nil || *createdPost.SanctumID != approveResult.Sanctum.ID {
		t.Errorf("expected post sanctum_id %d, got %v", approveResult.Sanctum.ID, createdPost.SanctumID)
	}

	// 6. Verify post shows up in the sanctum feed
	feedPath := fmt.Sprintf("/api/posts?sanctum_id=%d", approveResult.Sanctum.ID)
	getFeedReq := authReq(t, http.MethodGet, feedPath, requester.Token, nil)
	getFeedResp, err := app.Test(getFeedReq, -1)
	if err != nil {
		t.Fatalf("get feed: %v", err)
	}
	if getFeedResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for feed, got %d", getFeedResp.StatusCode)
	}

	var feedPosts []models.Post
	if err := json.NewDecoder(getFeedResp.Body).Decode(&feedPosts); err != nil {
		t.Fatalf("decode feed posts: %v", err)
	}
	_ = getFeedResp.Body.Close()

	foundPost := false
	for _, p := range feedPosts {
		if p.ID == createdPost.ID {
			foundPost = true
			break
		}
	}
	if !foundPost {
		t.Errorf("created post ID %d not found in sanctum feed", createdPost.ID)
	}
}
