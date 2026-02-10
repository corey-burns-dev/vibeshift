package test

import (
	"encoding/json"
	"net/http"
	"sort"
	"testing"

	"sanctum/internal/database"
	"sanctum/internal/models"
	"sanctum/internal/seed"
)

func TestSanctumMembershipsBulkAndMe(t *testing.T) {
	app := newSanctumTestApp(t)
	user := signupSanctumUser(t, app, "membership_user")
	other := signupSanctumUser(t, app, "membership_other")

	t.Run("requires auth", func(t *testing.T) {
		getReq := jsonReq(t, http.MethodGet, "/api/sanctums/memberships/me", nil)
		getResp, getErr := app.Test(getReq, -1)
		if getErr != nil {
			t.Fatalf("get memberships: %v", getErr)
		}
		defer func() { _ = getResp.Body.Close() }()
		if getResp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected GET 401 got %d", getResp.StatusCode)
		}

		postReq := jsonReq(t, http.MethodPost, "/api/sanctums/memberships/bulk", map[string]any{
			"sanctum_slugs": []string{"atrium", "development", "gaming"},
		})
		postResp, postErr := app.Test(postReq, -1)
		if postErr != nil {
			t.Fatalf("post memberships: %v", postErr)
		}
		defer func() { _ = postResp.Body.Close() }()
		if postResp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected POST 401 got %d", postResp.StatusCode)
		}
	})

	t.Run("bulk upsert and scoped retrieval", func(t *testing.T) {
		seedReq := authReq(t, http.MethodPost, "/api/sanctums/memberships/bulk", other.Token, map[string]any{
			"sanctum_slugs": []string{"atrium", "movies", "television"},
		})
		seedResp, seedErr := app.Test(seedReq, -1)
		if seedErr != nil {
			t.Fatalf("seed other memberships: %v", seedErr)
		}
		_ = seedResp.Body.Close()

		saveReq := authReq(t, http.MethodPost, "/api/sanctums/memberships/bulk", user.Token, map[string]any{
			"sanctum_slugs": []string{"atrium", "development", "gaming"},
		})
		saveResp, saveErr := app.Test(saveReq, -1)
		if saveErr != nil {
			t.Fatalf("save memberships: %v", saveErr)
		}
		defer func() { _ = saveResp.Body.Close() }()
		if saveResp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 got %d", saveResp.StatusCode)
		}

		var saved []struct {
			Sanctum struct {
				Slug string `json:"slug"`
			} `json:"sanctum"`
		}
		if err := json.NewDecoder(saveResp.Body).Decode(&saved); err != nil {
			t.Fatalf("decode save memberships: %v", err)
		}
		if len(saved) != 3 {
			t.Fatalf("expected 3 memberships got %d", len(saved))
		}

		getReq := authReq(t, http.MethodGet, "/api/sanctums/memberships/me", user.Token, nil)
		getResp, getErr := app.Test(getReq, -1)
		if getErr != nil {
			t.Fatalf("get memberships: %v", getErr)
		}
		defer func() { _ = getResp.Body.Close() }()
		if getResp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 got %d", getResp.StatusCode)
		}

		var rows []struct {
			UserID  uint `json:"user_id"`
			Sanctum struct {
				Slug string `json:"slug"`
			} `json:"sanctum"`
		}
		if err := json.NewDecoder(getResp.Body).Decode(&rows); err != nil {
			t.Fatalf("decode get memberships: %v", err)
		}
		if len(rows) != 3 {
			t.Fatalf("expected 3 rows got %d", len(rows))
		}

		got := make([]string, 0, len(rows))
		for _, row := range rows {
			if row.UserID != user.ID {
				t.Fatalf("expected user_id=%d got %d", user.ID, row.UserID)
			}
			got = append(got, row.Sanctum.Slug)
		}
		sort.Strings(got)
		want := []string{"atrium", "development", "gaming"}
		sort.Strings(want)
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("expected slug %s at pos %d got %s", want[i], i, got[i])
			}
		}

		resaveReq := authReq(t, http.MethodPost, "/api/sanctums/memberships/bulk", user.Token, map[string]any{
			"sanctum_slugs": []string{"atrium", "anime", "development"},
		})
		resaveResp, resaveErr := app.Test(resaveReq, -1)
		if resaveErr != nil {
			t.Fatalf("resave memberships: %v", resaveErr)
		}
		_ = resaveResp.Body.Close()

		verifyReq := authReq(t, http.MethodGet, "/api/sanctums/memberships/me", user.Token, nil)
		verifyResp, verifyErr := app.Test(verifyReq, -1)
		if verifyErr != nil {
			t.Fatalf("verify memberships: %v", verifyErr)
		}
		defer func() { _ = verifyResp.Body.Close() }()

		var rowsAfter []struct {
			Sanctum struct {
				Slug string `json:"slug"`
			} `json:"sanctum"`
		}
		if err := json.NewDecoder(verifyResp.Body).Decode(&rowsAfter); err != nil {
			t.Fatalf("decode verify memberships: %v", err)
		}
		slugsAfter := make([]string, 0, len(rowsAfter))
		for _, row := range rowsAfter {
			slugsAfter = append(slugsAfter, row.Sanctum.Slug)
		}
		sort.Strings(slugsAfter)
		wantAfter := []string{"anime", "atrium", "development"}
		for i := range wantAfter {
			if slugsAfter[i] != wantAfter[i] {
				t.Fatalf("expected slug %s at pos %d got %s", wantAfter[i], i, slugsAfter[i])
			}
		}
	})
}

func TestGetSanctumsStableAfterReseed(t *testing.T) {
	app := newSanctumTestApp(t)

	firstReq := jsonReq(t, http.MethodGet, "/api/sanctums", nil)
	firstResp, firstErr := app.Test(firstReq, -1)
	if firstErr != nil {
		t.Fatalf("first get sanctums: %v", firstErr)
	}
	defer func() { _ = firstResp.Body.Close() }()

	if firstResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 got %d", firstResp.StatusCode)
	}

	var first []map[string]any
	if err := json.NewDecoder(firstResp.Body).Decode(&first); err != nil {
		t.Fatalf("decode first sanctums: %v", err)
	}

	if len(first) == 0 {
		t.Fatal("expected seeded sanctums, got empty list")
	}

	if err := seed.Sanctums(database.DB); err != nil {
		t.Fatalf("re-seed sanctums: %v", err)
	}

	secondReq := jsonReq(t, http.MethodGet, "/api/sanctums", nil)
	secondResp, secondErr := app.Test(secondReq, -1)
	if secondErr != nil {
		t.Fatalf("second get sanctums: %v", secondErr)
	}
	defer func() { _ = secondResp.Body.Close() }()

	if secondResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 got %d", secondResp.StatusCode)
	}

	var second []map[string]any
	if err := json.NewDecoder(secondResp.Body).Decode(&second); err != nil {
		t.Fatalf("decode second sanctums: %v", err)
	}

	if len(first) != len(second) {
		t.Fatalf("sanctum count changed after re-seed: %d -> %d", len(first), len(second))
	}

	firstSlugs := make(map[string]struct{}, len(first))
	for _, row := range first {
		slug, _ := row["slug"].(string)
		if slug != "" {
			firstSlugs[slug] = struct{}{}
		}
	}

	for _, row := range second {
		slug, _ := row["slug"].(string)
		if _, ok := firstSlugs[slug]; !ok {
			t.Fatalf("slug %q missing from first response", slug)
		}
	}
}

func TestCreateSanctumRequest(t *testing.T) {
	app := newSanctumTestApp(t)
	user := signupSanctumUser(t, app, "sanctum_req")
	slug := uniqueSanctumSlug("qa")

	t.Run("requires auth", func(t *testing.T) {
		req := jsonReq(t, http.MethodPost, "/api/sanctums/requests", map[string]string{
			"requested_name": "QA Sanctum",
			"requested_slug": slug,
			"reason":         "Testing",
		})
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401 got %d", resp.StatusCode)
		}
	})

	t.Run("creates pending request", func(t *testing.T) {
		req := authReq(t, http.MethodPost, "/api/sanctums/requests", user.Token, map[string]string{
			"requested_name": "QA Sanctum",
			"requested_slug": slug,
			"reason":         "Testing",
		})
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201 got %d", resp.StatusCode)
		}

		var created models.SanctumRequest
		if err := json.NewDecoder(resp.Body).Decode(&created); err != nil {
			t.Fatalf("decode response: %v", err)
		}

		if created.Status != models.SanctumRequestStatusPending {
			t.Fatalf("expected pending status got %s", created.Status)
		}
		if created.RequestedByUserID != user.ID {
			t.Fatalf("expected requested_by_user_id=%d got %d", user.ID, created.RequestedByUserID)
		}
	})

	t.Run("duplicate pending slug returns conflict", func(t *testing.T) {
		req := authReq(t, http.MethodPost, "/api/sanctums/requests", user.Token, map[string]string{
			"requested_name": "QA Sanctum Dup",
			"requested_slug": slug,
			"reason":         "Duplicate",
		})
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("expected 409 got %d", resp.StatusCode)
		}
	})
}

func TestGetMySanctumRequests(t *testing.T) {
	app := newSanctumTestApp(t)
	userA := signupSanctumUser(t, app, "sanctum_a")
	userB := signupSanctumUser(t, app, "sanctum_b")

	slugA := uniqueSanctumSlug("minea")
	slugB := uniqueSanctumSlug("mineb")

	for _, tc := range []struct {
		user authUser
		slug string
		name string
	}{
		{user: userA, slug: slugA, name: "Mine A"},
		{user: userB, slug: slugB, name: "Mine B"},
	} {
		req := authReq(t, http.MethodPost, "/api/sanctums/requests", tc.user.Token, map[string]string{
			"requested_name": tc.name,
			"requested_slug": tc.slug,
			"reason":         "Ownership filter",
		})
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("create request: %v", err)
		}
		_ = resp.Body.Close()
	}

	t.Run("requires auth", func(t *testing.T) {
		req := jsonReq(t, http.MethodGet, "/api/sanctums/requests/me", nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401 got %d", resp.StatusCode)
		}
	})

	t.Run("returns only current user requests", func(t *testing.T) {
		req := authReq(t, http.MethodGet, "/api/sanctums/requests/me", userA.Token, nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 got %d", resp.StatusCode)
		}

		var rows []models.SanctumRequest
		if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
			t.Fatalf("decode response: %v", err)
		}

		if len(rows) == 0 {
			t.Fatal("expected at least one request")
		}

		for _, row := range rows {
			if row.RequestedByUserID != userA.ID {
				t.Fatalf("expected only user %d rows, got row from %d", userA.ID, row.RequestedByUserID)
			}
		}
	})
}

func TestAdminEndpointsRequireAdmin(t *testing.T) {
	app := newSanctumTestApp(t)
	user := signupSanctumUser(t, app, "nonadmin")
	admin := signupSanctumUser(t, app, "admin")
	makeSanctumAdmin(t, admin.ID)

	pendingSlug := uniqueSanctumSlug("queue")
	createReq := authReq(t, http.MethodPost, "/api/sanctums/requests", user.Token, map[string]string{
		"requested_name": "Queue Item",
		"requested_slug": pendingSlug,
		"reason":         "For moderation",
	})
	createResp, err := app.Test(createReq, -1)
	if err != nil {
		t.Fatalf("create pending request: %v", err)
	}
	defer func() { _ = createResp.Body.Close() }()
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 got %d", createResp.StatusCode)
	}

	var pending models.SanctumRequest
	if err := json.NewDecoder(createResp.Body).Decode(&pending); err != nil {
		t.Fatalf("decode pending request: %v", err)
	}

	t.Run("list requires auth", func(t *testing.T) {
		req := jsonReq(t, http.MethodGet, "/api/admin/sanctum-requests?status=pending", nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401 got %d", resp.StatusCode)
		}
	})

	t.Run("non admin cannot list", func(t *testing.T) {
		req := authReq(t, http.MethodGet, "/api/admin/sanctum-requests?status=pending", user.Token, nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403 got %d", resp.StatusCode)
		}
	})

	t.Run("admin can list", func(t *testing.T) {
		req := authReq(t, http.MethodGet, "/api/admin/sanctum-requests?status=pending", admin.Token, nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 got %d", resp.StatusCode)
		}
	})

	t.Run("non admin cannot approve", func(t *testing.T) {
		path := "/api/admin/sanctum-requests/" + itoa(pending.ID) + "/approve"
		req := authReq(t, http.MethodPost, path, user.Token, map[string]string{"review_notes": "x"})
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403 got %d", resp.StatusCode)
		}
	})

	t.Run("admin can reject", func(t *testing.T) {
		path := "/api/admin/sanctum-requests/" + itoa(pending.ID) + "/reject"
		req := authReq(t, http.MethodPost, path, admin.Token, map[string]string{"review_notes": "not now"})
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 got %d", resp.StatusCode)
		}
	})
}

func TestApproveCreatesSanctumMembershipChatroom(t *testing.T) {
	app := newSanctumTestApp(t)
	requester := signupSanctumUser(t, app, "approve_owner")
	admin := signupSanctumUser(t, app, "approve_admin")
	makeSanctumAdmin(t, admin.ID)

	slug := uniqueSanctumSlug("approved")
	createReq := authReq(t, http.MethodPost, "/api/sanctums/requests", requester.Token, map[string]string{
		"requested_name": "Approved Space",
		"requested_slug": slug,
		"reason":         "Approve flow",
	})
	createResp, createErr := app.Test(createReq, -1)
	if createErr != nil {
		t.Fatalf("create request: %v", createErr)
	}
	defer func() { _ = createResp.Body.Close() }()

	var pending models.SanctumRequest
	if err := json.NewDecoder(createResp.Body).Decode(&pending); err != nil {
		t.Fatalf("decode request: %v", err)
	}

	approvePath := "/api/admin/sanctum-requests/" + itoa(pending.ID) + "/approve"
	approveReq := authReq(t, http.MethodPost, approvePath, admin.Token, map[string]string{
		"review_notes": "looks good",
	})
	approveResp, err := app.Test(approveReq, -1)
	if err != nil {
		t.Fatalf("approve request: %v", err)
	}
	defer func() { _ = approveResp.Body.Close() }()

	if approveResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 got %d", approveResp.StatusCode)
	}

	var approveBody struct {
		Request models.SanctumRequest `json:"request"`
		Sanctum struct {
			ID                uint   `json:"id"`
			Slug              string `json:"slug"`
			DefaultChatRoomID *uint  `json:"default_chat_room_id"`
		} `json:"sanctum"`
	}
	if err := json.NewDecoder(approveResp.Body).Decode(&approveBody); err != nil {
		t.Fatalf("decode approve response: %v", err)
	}

	if approveBody.Request.Status != models.SanctumRequestStatusApproved {
		t.Fatalf("expected approved status, got %s", approveBody.Request.Status)
	}
	if approveBody.Sanctum.Slug != slug {
		t.Fatalf("expected slug %q got %q", slug, approveBody.Sanctum.Slug)
	}
	if approveBody.Sanctum.DefaultChatRoomID == nil || *approveBody.Sanctum.DefaultChatRoomID == 0 {
		t.Fatal("expected default_chat_room_id in response")
	}

	var membership models.SanctumMembership
	if err := database.DB.Where("sanctum_id = ? AND user_id = ?", approveBody.Sanctum.ID, requester.ID).First(&membership).Error; err != nil {
		t.Fatalf("owner membership missing: %v", err)
	}
	if membership.Role != models.SanctumMembershipRoleOwner {
		t.Fatalf("expected owner role got %s", membership.Role)
	}

	var room models.Conversation
	if err := database.DB.Where("sanctum_id = ?", approveBody.Sanctum.ID).First(&room).Error; err != nil {
		t.Fatalf("default chat room missing: %v", err)
	}
	if room.ID == 0 {
		t.Fatal("expected conversation id")
	}
}

func TestRejectPersistsReviewNotes(t *testing.T) {
	app := newSanctumTestApp(t)
	requester := signupSanctumUser(t, app, "reject_owner")
	admin := signupSanctumUser(t, app, "reject_admin")
	makeSanctumAdmin(t, admin.ID)

	slug := uniqueSanctumSlug("rejected")
	createReq := authReq(t, http.MethodPost, "/api/sanctums/requests", requester.Token, map[string]string{
		"requested_name": "Rejected Space",
		"requested_slug": slug,
		"reason":         "Reject flow",
	})
	createResp, createErr := app.Test(createReq, -1)
	if createErr != nil {
		t.Fatalf("create request: %v", createErr)
	}
	defer func() { _ = createResp.Body.Close() }()

	var pending models.SanctumRequest
	if err := json.NewDecoder(createResp.Body).Decode(&pending); err != nil {
		t.Fatalf("decode request: %v", err)
	}

	rejectPath := "/api/admin/sanctum-requests/" + itoa(pending.ID) + "/reject"
	notes := "does not meet moderation criteria"
	rejectReq := authReq(t, http.MethodPost, rejectPath, admin.Token, map[string]string{
		"review_notes": notes,
	})
	rejectResp, err := app.Test(rejectReq, -1)
	if err != nil {
		t.Fatalf("reject request: %v", err)
	}
	defer func() { _ = rejectResp.Body.Close() }()

	if rejectResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 got %d", rejectResp.StatusCode)
	}

	var rejected models.SanctumRequest
	if err := json.NewDecoder(rejectResp.Body).Decode(&rejected); err != nil {
		t.Fatalf("decode reject response: %v", err)
	}

	if rejected.Status != models.SanctumRequestStatusRejected {
		t.Fatalf("expected rejected status got %s", rejected.Status)
	}
	if rejected.ReviewNotes != notes {
		t.Fatalf("expected review notes %q got %q", notes, rejected.ReviewNotes)
	}

	var stored models.SanctumRequest
	if err := database.DB.First(&stored, pending.ID).Error; err != nil {
		t.Fatalf("load request from db: %v", err)
	}
	if stored.Status != models.SanctumRequestStatusRejected {
		t.Fatalf("expected stored status rejected got %s", stored.Status)
	}
	if stored.ReviewNotes != notes {
		t.Fatalf("expected stored review notes %q got %q", notes, stored.ReviewNotes)
	}
}
