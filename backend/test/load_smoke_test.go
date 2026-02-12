//go:build load

package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync"
	"testing"
	"time"
)

type loadResult struct {
	statusCode int
	duration   time.Duration
	err        error
}

func runConcurrent(
	t *testing.T,
	total int,
	concurrency int,
	fn func(i int) loadResult,
) []loadResult {
	t.Helper()

	results := make([]loadResult, total)
	var wg sync.WaitGroup
	sem := make(chan struct{}, concurrency)

	for i := 0; i < total; i++ {
		wg.Add(1)
		sem <- struct{}{}

		go func(idx int) {
			defer wg.Done()
			defer func() { <-sem }()
			results[idx] = fn(idx)
		}(i)
	}

	wg.Wait()
	return results
}

func summarize(results []loadResult) (int, time.Duration, time.Duration) {
	failures := 0
	durations := make([]time.Duration, 0, len(results))

	for _, r := range results {
		durations = append(durations, r.duration)
		if r.err != nil || r.statusCode >= 400 {
			failures++
		}
	}

	if len(durations) == 0 {
		return failures, 0, 0
	}

	sort.Slice(durations, func(i, j int) bool {
		return durations[i] < durations[j]
	})

	p95Idx := int(float64(len(durations)-1) * 0.95)
	if p95Idx < 0 {
		p95Idx = 0
	}
	p95 := durations[p95Idx]
	max := durations[len(durations)-1]
	return failures, p95, max
}

func TestLoadScenarios(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping load tests in short mode")
	}

	app := newSanctumTestApp(t)
	mainUser := signupSanctumUser(t, app, "load_main")

	t.Run("Login", func(t *testing.T) {
		loginPayload := map[string]string{
			"email":    mainUser.Email,
			"password": "TestPass123!@#",
		}
		loginBody, _ := json.Marshal(loginPayload)

		results := runConcurrent(t, 30, 10, func(_ int) loadResult {
			start := time.Now()
			req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req, -1)
			if err != nil {
				return loadResult{err: err, duration: time.Since(start)}
			}
			defer func() { _ = resp.Body.Close() }()
			return loadResult{statusCode: resp.StatusCode, duration: time.Since(start)}
		})

		failures, p95, max := summarize(results)
		t.Logf("login load: requests=%d failures=%d p95=%s max=%s", len(results), failures, p95, max)
		if failures > 0 {
			t.Fatalf("login load had %d failures", failures)
		}
	})

	t.Run("FeedRead", func(t *testing.T) {
		results := runConcurrent(t, 40, 10, func(_ int) loadResult {
			start := time.Now()
			req := httptest.NewRequest(http.MethodGet, "/api/posts?limit=20", nil)
			req.Header.Set("Authorization", "Bearer "+mainUser.Token)
			resp, err := app.Test(req, -1)
			if err != nil {
				return loadResult{err: err, duration: time.Since(start)}
			}
			defer func() { _ = resp.Body.Close() }()
			return loadResult{statusCode: resp.StatusCode, duration: time.Since(start)}
		})

		failures, p95, max := summarize(results)
		t.Logf("feed load: requests=%d failures=%d p95=%s max=%s", len(results), failures, p95, max)
		if failures > 0 {
			t.Fatalf("feed load had %d failures", failures)
		}
	})

	t.Run("ChatSend", func(t *testing.T) {
		const senders = 20
		participants := make([]authUser, 0, senders)
		participantIDs := make([]uint, 0, senders)

		for i := 0; i < senders; i++ {
			u := signupSanctumUser(t, app, fmt.Sprintf("load_chat_%d", i))
			participants = append(participants, u)
			participantIDs = append(participantIDs, u.ID)
		}

		createConvBody := map[string]interface{}{
			"participant_ids": participantIDs,
			"is_group":        true,
			"name":            "load-chat-room",
		}
		createConvJSON, _ := json.Marshal(createConvBody)
		createConvReq := httptest.NewRequest(http.MethodPost, "/api/conversations", bytes.NewReader(createConvJSON))
		createConvReq.Header.Set("Content-Type", "application/json")
		createConvReq.Header.Set("Authorization", "Bearer "+mainUser.Token)
		createConvResp, err := app.Test(createConvReq, -1)
		if err != nil {
			t.Fatalf("create conversation request failed: %v", err)
		}
		defer func() { _ = createConvResp.Body.Close() }()
		if createConvResp.StatusCode != http.StatusCreated {
			t.Fatalf("create conversation expected %d got %d", http.StatusCreated, createConvResp.StatusCode)
		}

		var convResp struct {
			ID uint `json:"id"`
		}
		if err := json.NewDecoder(createConvResp.Body).Decode(&convResp); err != nil {
			t.Fatalf("decode conversation response: %v", err)
		}
		if convResp.ID == 0 {
			t.Fatal("conversation ID is empty")
		}

		results := runConcurrent(t, senders, 10, func(i int) loadResult {
			msgPayload := map[string]string{
				"content":      fmt.Sprintf("load message %d", i),
				"message_type": "text",
			}
			msgJSON, _ := json.Marshal(msgPayload)

			start := time.Now()
			req := httptest.NewRequest(
				http.MethodPost,
				fmt.Sprintf("/api/conversations/%d/messages", convResp.ID),
				bytes.NewReader(msgJSON),
			)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+participants[i].Token)

			resp, err := app.Test(req, -1)
			if err != nil {
				return loadResult{err: err, duration: time.Since(start)}
			}
			defer func() { _ = resp.Body.Close() }()

			return loadResult{statusCode: resp.StatusCode, duration: time.Since(start)}
		})

		successes := 0
		rateLimited := 0
		otherFailures := 0
		durations := make([]loadResult, 0, len(results))

		for _, r := range results {
			durations = append(durations, r)
			if r.err != nil {
				otherFailures++
				continue
			}
			switch r.statusCode {
			case http.StatusCreated:
				successes++
			case http.StatusTooManyRequests:
				rateLimited++
			default:
				otherFailures++
			}
		}

		failures, p95, max := summarize(durations)
		t.Logf(
			"chat send load: requests=%d success=%d rate_limited=%d other_failures=%d p95=%s max=%s raw_failures=%d",
			len(results), successes, rateLimited, otherFailures, p95, max, failures,
		)
		if successes == 0 {
			t.Fatal("chat send load had no successful message creates")
		}
		if otherFailures > 0 {
			t.Fatalf("chat send load had %d unexpected failures", otherFailures)
		}
	})
}
