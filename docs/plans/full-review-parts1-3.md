# Plan: Fix HIGH-3, HIGH-2, HIGH-1 from Production Review

## Context

The 2026-02-12 deep production review identified 5 HIGH priority issues. This plan addresses the first 3, ordered by effort (smallest first). Each fix is independently committable.

---

## Fix 1: Panic Recovery in Subscriber Goroutines (HIGH-3)

**Why:** 3 Redis pub/sub goroutines in `notifier.go` will permanently die if a callback panics, silently killing all real-time notifications/chat/games until server restart.

**File:** `backend/internal/notifications/notifier.go`

**Changes:**

- Add `"log"` and `"runtime/debug"` to imports
- Wrap `onMessage(...)` in all 3 subscriber goroutines (lines 53-58, 120-123, 150-153) with per-message panic recovery using an IIFE:

```go
go func() {
    for msg := range ch {
        func() {
            defer func() {
                if r := recover(); r != nil {
                    log.Printf("PANIC in <Name>Subscriber: %v\n%s", r, debug.Stack())
                }
            }()
            onMessage(msg.Channel, msg.Payload)
        }()
    }
}()
```

The IIFE ensures recovery per message (bare `defer` in a `for` loop only fires on goroutine exit). Uses `log.Printf` to match existing package convention.

**Verification:** `make test-backend`

---

## Fix 2: Rate Limits on Admin/Moderation Endpoints (HIGH-2)

**Why:** Admin endpoints have no throttling — a compromised admin account can enumerate all data without limits. Users can spam report endpoints.

**File:** `backend/internal/server/server.go`

**Changes — admin endpoints (lines 419-431):**

Add `middleware.RateLimit(...)` to each route:

- **Admin reads** (GET): `30 req / 1 min`, resource name `"admin_read"`
  - `/feature-flags`, `/reports`, `/ban-requests`, `/users`, `/users/:id`, `/sanctum-requests/`
- **Admin writes** (POST): `10 req / 5 min`, resource name `"admin_write"`
  - `/reports/:id/resolve`, `/users/:id/ban`, `/users/:id/unban`, `/sanctum-requests/:id/approve`, `/sanctum-requests/:id/reject`

**Changes — user report endpoints (lines 339, 368, 385):**

Add `middleware.RateLimit(s.redis, 5, 10*time.Minute, "report")` to:

- `users.Post("/:id/report", ...)`
- `posts.Post("/:id/report", ...)`
- `conversations.Post("/:id/messages/:messageId/report", ...)`

Shared `"report"` bucket = 5 total reports per 10 min across all types.

No new imports needed (`middleware` and `time` already imported). Rate limits are auto-disabled in test/dev environments, so existing tests won't break.

**Verification:** `make test-backend`

---

## Fix 3: Test Coverage for Moderation Suite (HIGH-1)

**Why:** 929 lines of security-critical handler code (blocking, banning, reporting, admin management) have zero tests.

**Approach:** SQLite-based unit tests following the established pattern in `sanctum_handlers_test.go`. These handlers use `s.db` directly (not repository interfaces), so SQLite in-memory testing is the right fit — same pattern already proven in this codebase.

### File 1: `backend/internal/server/moderation_handlers_test.go` (new)

**Setup:** New `setupModerationTestDB(t)` extending `setupSanctumHandlerTestDB` with additional models: `ModerationReport`, `Post`, `Message`, `UserBlock`, `ChatroomMute`, etc.

**Tests (~20 cases):**

| Function              | Test Cases                                      |
| --------------------- | ----------------------------------------------- |
| `GetMyBlocks`         | empty list; with blocks                         |
| `BlockUser`           | success; self-block prevention; duplicate block |
| `UnblockUser`         | success; not found                              |
| `ReportUser`          | success; missing reason; target not found       |
| `ReportPost`          | success; post not found                         |
| `GetAdminReports`     | empty; with status/type filters                 |
| `ResolveAdminReport`  | success; invalid status; not found              |
| `GetAdminBanRequests` | aggregation with multiple reports               |
| `GetAdminUsers`       | list; search filter                             |
| `GetAdminUserDetail`  | success; not found                              |
| `BanUser`             | success; self-ban prevention                    |
| `UnbanUser`           | success                                         |

`ReportMessage` deferred (requires `chatSvc()` with real repositories).

### File 2: `backend/internal/server/sanctum_admin_handlers_test.go` (new)

**Tests (~7 cases):**

| Function              | Test Cases                              |
| --------------------- | --------------------------------------- |
| `GetSanctumAdmins`    | as owner (200); as non-owner (403)      |
| `PromoteSanctumAdmin` | success; user not found                 |
| `DemoteSanctumAdmin`  | success; cannot demote owner; not found |

### File 3: `backend/internal/server/chat_safety_handlers_test.go` (new)

**Tests (~4 cases):**

| Function                    | Test Cases                               |
| --------------------------- | ---------------------------------------- |
| `GetMyMentions`             | empty; with mentions                     |
| `getMessageReactionSummary` | direct helper test with seeded reactions |

`AddMessageReaction`/`RemoveMessageReaction` deferred (require `chatHub` + `chatSvc()`).

**Verification:** `make test-backend`

---

## Commit Sequence

1. `fix: add panic recovery to Redis pub/sub subscriber goroutines`
2. `fix: add rate limits to admin and moderation report endpoints`
3. `test: add test coverage for moderation, chat safety, and sanctum admin handlers`

## Files Summary

| File                                                     | Action                 |
| -------------------------------------------------------- | ---------------------- |
| `backend/internal/notifications/notifier.go`             | Edit (add recovery)    |
| `backend/internal/server/server.go`                      | Edit (add rate limits) |
| `backend/internal/server/moderation_handlers_test.go`    | Create                 |
| `backend/internal/server/sanctum_admin_handlers_test.go` | Create                 |
| `backend/internal/server/chat_safety_handlers_test.go`   | Create                 |
