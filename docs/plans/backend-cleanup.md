# Backend Code Review — Cleanup & Optimization Plan

## Context

A full review of `backend/internal/` revealed a mix of confirmed bugs, structural duplication,
logging inconsistencies, and test quality issues. This plan addresses findings in priority order:
bugs first, then deduplication, logging, clarity, and tests. All changes are behaviour-preserving
unless noted. No architecture rewrites — only targeted improvements.

---

## Group 1: Bug Fixes (Critical)

### 1.1 Goroutine leak in `StartVideoChatSubscriber`

**File:** `backend/internal/notifications/notifier.go:235–238`

`StartVideoChatSubscriber` launches a goroutine that loops over `ch` with no `ctx.Done()` escape.
Unlike `StartPatternSubscriber` and `StartChatSubscriber`, it will block forever if the context is
cancelled before the Redis channel closes.

**Fix:** Replace the simple `for msg := range ch` loop with a `select` on both `ch` and `ctx.Done()`,
matching the pattern in `StartPatternSubscriber` (lines 55–75). Also defer-close the subscription.

### 1.2 Discarded context in `ImageService.ResolveForServing`

**File:** `backend/internal/service/image_service.go:277`

The method signature is `ResolveForServing(_ context.Context, ...)` — the context is intentionally
discarded and `context.Background()` is used internally for the repo call. This bypasses any
request-scoped deadlines or cancellations.

**Fix:** Change `_` to `ctx` in the parameter list and pass it to `s.repo.GetByHash(ctx, hash)`.

### 1.3 Redundant Like-status query + `fmt.Printf` error in `PostRepository.GetByID`

**File:** `backend/internal/repository/post.go:65–72`

Two bugs together:

- `applyPostDetails` (called at line ~57) already embeds a subquery for `liked` status. Lines 65–72
  run a second `COUNT` query for the same thing, overwriting the already-correct value.
- The error from that second query is surfaced via `fmt.Printf` to stdout instead of the logger.

**Fix:** Delete lines 65–72 entirely. The `applyPostDetails` subquery is the authoritative source.

### 1.4 `ChatHub.JoinConversation` — misleading map semantics and stale TODOs

**File:** `backend/internal/notifications/chat_hub.go:243–262`

The `conversations` map is `map[uint]map[uint]*Client`. The value `*Client` is acknowledged in the
comments to be "legacy" — `BroadcastToConversation` actually iterates `userConns`, not the stored
client pointer. The stored pointer is set to an arbitrary connection (`anyClient`), the comments
contain self-contradicting TODOs about whether this matters, and the phrase "We just mark presence"
appears twice on consecutive lines.

**Fix:**

- Change `conversations` map type to `map[uint]map[uint]struct{}`.
- Update `JoinConversation` to store `struct{}{}` instead of a client pointer.
- Update `BroadcastToConversation` to iterate the conversation's user-ID keys from `conversations`
  and fan out to each user's connections via `userConns` (if it doesn't already).
- Remove the contradictory comments.

---

## Group 2: Deduplication

### 2.1 Error-to-HTTP-status mapping — 15+ duplicates

**Files:** `chat_handlers.go:150–162`, `comment_handlers.go:36–47`, `friend_handlers.go:24–38`,
`image_handlers.go:61–72`, `post_handlers.go:66–72`, `user_handlers.go:101–107`, and others.

Every handler that calls a service method contains the same `switch appErr.Code` block mapping
`VALIDATION_ERROR` → 400, `UNAUTHORIZED` → 403, `gorm.ErrRecordNotFound` → 404.

**Fix:** Add a helper to `backend/internal/server/helpers.go`:

```go
// mapServiceError returns the HTTP status code for a service-layer error.
func mapServiceError(err error) int {
    var appErr *models.AppError
    if errors.As(err, &appErr) {
        switch appErr.Code {
        case "VALIDATION_ERROR":
            return fiber.StatusBadRequest
        case "UNAUTHORIZED":
            return fiber.StatusForbidden
        case "FORBIDDEN":
            return fiber.StatusForbidden
        case "NOT_FOUND":
            return fiber.StatusNotFound
        case "CONFLICT":
            return fiber.StatusConflict
        }
    }
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return fiber.StatusNotFound
    }
    return fiber.StatusInternalServerError
}
```

Replace all inline switch blocks with `return models.RespondWithError(c, mapServiceError(err), err)`.

> **Note on inconsistency:** `auth_handlers.go` maps `VALIDATION_ERROR` → 409 Conflict (for
> duplicate email). That handler should keep its explicit override and not use the helper for that
> specific case, or a dedicated `DUPLICATE` code should be used.

### 2.2 `getReadDB` pattern — 20+ duplicates in repositories

**Files:** `repository/user.go` (lines 43, 71, 90, 105, …), `repository/chat.go` (lines 65, 95, 195, …), etc.

```go
readDB := database.GetReadDB()
if readDB == nil {
    readDB = r.db
}
```

**Fix:** Add a package-level helper in `backend/internal/repository/` (e.g., in a new small file
`base.go` or a helper method on each concrete repo struct):

```go
func readDB(primary *gorm.DB) *gorm.DB {
    if db := database.GetReadDB(); db != nil {
        return db
    }
    return primary
}
```

Replace all 20+ inline blocks with `readDB(r.db)`.

### 2.3 `isSchemaMissingError` defined twice

**Files:**

- `backend/internal/server/helpers.go:129–137`
- `backend/internal/service/chat_service.go:518–...`

Both functions are byte-for-byte identical. The service package imports a different set of packages
than the server package, so neither can import the other.

**Fix:** Move the canonical definition to `backend/internal/models/errors.go` (or a new
`backend/internal/database/errors.go`). Both packages already import `models` or `database`.
Delete the duplicate.

### 2.4 Remove `isMasterAdminByUserID` no-op wrapper

**File:** `backend/internal/server/helpers.go:102–105`

```go
func (s *Server) isMasterAdminByUserID(ctx context.Context, userID uint) (bool, error) {
    return s.isAdminByUserID(ctx, userID)
}
```

This is an identity wrapper. All 5 call sites (`canManageSanctumByUserID`,
`canManageSanctumAsOwnerByUserID`, `canManageChatroomModeratorsByUserID`,
`canModerateChatroomByUserID`, and one more) call it instead of `isAdminByUserID` directly.

**Fix:** Delete `isMasterAdminByUserID`. Update all 5 call sites to call `s.isAdminByUserID(ctx, userID)`.

---

## Group 3: Logging Standardization

### 3.1 Replace `log.Printf` with structured logger

**Files:** `server/example_handlers.go` (WebSocket handler), `server/realtime_events.go`,
`notifications/chat_hub.go` (multiple), `notifications/game_hub.go` (multiple),
`middleware/ratelimit.go:90–98`, `service/game_service.go`, `service/image_service.go`

The codebase uses `observability.Logger` (a `*slog.Logger`) for structured logging in middleware,
but scattered `log.Printf` calls appear throughout handlers and notification hubs.

**Fix:** Replace every `log.Printf(...)` in the above files with the appropriate
`observability.Logger.InfoContext(ctx, ...)` / `observability.Logger.ErrorContext(ctx, ...)` call.
Use `slog.String`, `slog.Int`, `slog.Uint64`, etc. for structured fields.

Special attention:

- `example_handlers.go` WebSocket error: fix the string-concatenation JSON (`"` + err.Error() + `"`)
  by using `json.Marshal` or `fiber.Map` to avoid JSON injection if the error contains quotes.

---

## Group 4: Code Clarity

### 4.1 Fix incorrect HTTP status codes

Specific mismatches:

| File                      | Handler                  | Current | Should Be      |
| ------------------------- | ------------------------ | ------- | -------------- |
| `comment_handlers.go:177` | DeleteComment            | 200 OK  | 204 No Content |
| `chat_handlers.go:337`    | AddParticipant (success) | 200 OK  | 201 Created    |
| Various                   | Delete operations        | 200 OK  | 204 No Content |

**Fix:** Change `c.SendStatus(fiber.StatusOK)` → `c.SendStatus(fiber.StatusNoContent)` for
deletions; `fiber.StatusCreated` for resource creation where missing.

### 4.2 Standardize timestamp format

**File:** `backend/internal/server/sanctum_handlers.go:47–48`

```go
CreatedAt: s.CreatedAt.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
```

The hardcoded string is what `time.RFC3339Nano` expands to.

**Fix:** Replace with `s.CreatedAt.UTC().Format(time.RFC3339Nano)` (and same for `UpdatedAt`).

---

## Group 5: Test Improvements

### 5.1 Fix duplicate `resp.Body.Close()` — 17 files

**Files:** `user_handlers_test.go:54–60` and 16 others.

```go
defer func() { _ = resp.Body.Close() }()
defer func() { _ = resp.Body.Close() }()  // duplicate
```

**Fix:** Remove the second `defer` from all 17 occurrences. Use grep:
`resp.Body.Close()` appearing twice within 3 lines is the pattern.

### 5.2 Fix silently ignored JSON marshal errors in tests

**Files:** `auth_handlers_test.go:160`, `chat_handlers_test.go`, and others.

```go
body, _ := json.Marshal(tt.body)  // error silently dropped
```

**Fix:** Replace with:

```go
body, err := json.Marshal(tt.body)
require.NoError(t, err)
```

### 5.3 Extract shared `imageRepoStub` into test helper

**Files:** `image_handlers_test.go:25–113` and `image_service_test.go:22–119`

Both define identical `imageRepoStub` structs and `makeTestPNG`/`tinyPNG` helpers.

**Fix:** Create `backend/internal/testutil/image_stubs.go` with the shared stub and image-generation
helpers. Import it from both test files.

### 5.4 Add missing validation edge cases

**File:** `backend/internal/validation/password_test.go`

Missing test cases for `ValidatePassword`:

- Exactly **at** minimum length (12 chars)
- Exactly at maximum length (128 chars)
- Only digits + special (no letters) — should fail
- Unicode characters

**File:** `backend/internal/validation/password_test.go` (for `ValidateEmail`)

Missing:

- Multiple `@` symbols: `user@@example.com`
- Space in local part: `user @example.com`
- Trailing dot in domain: `user@example.com.`
- Exactly 254 chars total (boundary)

**Fix:** Add table-driven test cases for each validator covering boundaries and edge cases.

### 5.5 Fix timing-dependent tests

**Files:** `hub_test.go:14–34`, `chat_hub_test.go:178–227`

Tests use hard-coded `time.Sleep(10 * time.Millisecond)` and `time.Sleep(80 * time.Millisecond)`.
These are flaky under load.

**Fix:** Replace sleep-based synchronization with `assert.Eventually` (already used elsewhere in
the file) or channel-based signals. Keep grace period values at least 5× the sleep duration.
Factor out timing constants so they can be adjusted without editing multiple lines.

---

## Critical Files

| File                                              | Changes                                               |
| ------------------------------------------------- | ----------------------------------------------------- |
| `notifications/notifier.go`                       | Fix goroutine leak in `StartVideoChatSubscriber`      |
| `service/image_service.go`                        | Fix discarded context in `ResolveForServing`          |
| `repository/post.go`                              | Remove redundant Like query, fix fmt.Printf           |
| `notifications/chat_hub.go`                       | Fix `conversations` map type, clean comments          |
| `server/helpers.go`                               | Add `mapServiceError`, remove `isMasterAdminByUserID` |
| `server/chat_handlers.go` (and 9 others)          | Replace inline error-status blocks                    |
| `repository/user.go` (and 3 others)               | Replace `getReadDB` inline blocks                     |
| `service/chat_service.go`                         | Remove duplicate `isSchemaMissingError`               |
| `server/example_handlers.go`                      | Fix `log.Printf`, fix JSON string concat              |
| `server/realtime_events.go`                       | Fix `log.Printf`                                      |
| `notifications/chat_hub.go` (logging)             | Replace all `log.Printf`                              |
| `notifications/game_hub.go` (logging)             | Replace all `log.Printf`                              |
| `middleware/ratelimit.go`                         | Fix `log.Printf`                                      |
| `server/comment_handlers.go`                      | Fix 204 status on delete                              |
| `server/sanctum_handlers.go`                      | Fix `time.RFC3339Nano`                                |
| `*_test.go` (17 files)                            | Remove duplicate `Body.Close()`                       |
| `*_test.go` (multiple)                            | Fix ignored `json.Marshal` errors                     |
| `image_handlers_test.go`, `image_service_test.go` | Extract shared stub                                   |
| `validation/password_test.go`                     | Add edge case tests                                   |
| `hub_test.go`, `chat_hub_test.go`                 | Fix timing-dependent sleeps                           |

---

## Verification

After implementation, run:

```
make fmt
make lint
make test-backend
make test-backend-integration
```

Key things to manually verify:

- `StartVideoChatSubscriber` goroutine exits cleanly when context is cancelled (add a test)
- `ResolveForServing` propagates context (no new `context.Background()` in image service)
- Post `GetByID` returns correct `liked` field without second query (check query count in integration tests)
- `ChatHub.BroadcastToConversation` still fans out correctly to all room participants
- Duplicate body close lint warnings go away
- All existing tests still pass

---

## Out of Scope (noted for future)

- Missing transactions in `CreateConversation` + `AddParticipants` (needs schema-level decision)
- Missing transactions in game stats winner/loser updates (needs game service design review)
- `ModerationService.GetAdminUserDetail` N+1 queries (5 roundtrips; low traffic path)
- `handleMove` (244 lines) decomposition — behaviour-preserving but risk/reward ratio is high
- Full shared `testutil` mock registry for all stubs (larger refactor; image stub is the quick win)
