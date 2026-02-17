# Plan: Resolve HIGH-4 and HIGH-5 from `docs/reports/2026-02-12-2250-deep-production-review.md`

## Summary

- Fix `HIGH-4` by enforcing secure DB SSL mode in production startup validation.
- Fix `HIGH-5` with safety caps only: clamp parsed pagination globally and add hard `LIMIT` clauses to currently unbounded repository queries.
- Keep this pass backend-focused with no schema migration and no frontend pagination rollout.

## Implementation Spec

### 1. HIGH-4: DB SSL mode defaults to `disable`

1. Update `backend/internal/config/config.go`.
2. Normalize SSL mode in validation with `strings.TrimSpace` + `strings.ToLower`.
3. In production (`APP_ENV=production|prod`), return a validation error when normalized `DBSSLMode` is empty or `disable`.
4. Keep dev/test behavior unchanged so local workflows continue to work with `disable`.
5. Keep `database.buildDSN()` fallback logic unchanged for non-production compatibility.
6. Update `backend/config.production.example.yml` to include explicit secure default: `DB_SSLMODE: "require"`.
7. Update `scripts/config_sanity.sh` to enforce the same production rule so CI/preflight catches misconfig before runtime.

### 2. HIGH-5: Unbounded list queries

1. Update `backend/internal/server/helpers.go` `parsePagination()`:
2. Add max pagination constant: `100`.
3. Clamp `limit` to `[1..100]`, using handler default when input is `<= 0`.
4. Clamp `offset` to `>= 0`.
5. Update `backend/internal/repository/comment.go`:
6. Add hard cap constant: `1000`.
7. Apply `.Limit(1000)` in `ListByPost()`.
8. Keep existing order `created_at desc`.
9. Update `backend/internal/repository/friend.go`:
10. Add hard cap constant: `1000`.
11. Apply `.Limit(1000)` to `GetFriends()`, `GetPendingRequests()`, and `GetSentRequests()`.
12. Add deterministic ordering before limit:
13. `GetFriends()`: order by friendship recency (`f.created_at desc`).
14. `GetPendingRequests()` and `GetSentRequests()`: order by `created_at desc`.

## Public APIs / Interfaces / Types

- No new endpoints, request fields, or response types.
- Behavioral contract changes:

1. All handlers using `parsePagination()` now enforce `limit <= 100` and `offset >= 0`.
2. `GET /api/posts/:id/comments`, `GET /api/friends`, `GET /api/friends/requests`, and `GET /api/friends/requests/sent` are hard-capped to 1000 records server-side.

- No repository/service method signatures change in this pass.

## Tests and Acceptance Criteria

### Config + SSL enforcement

1. Add `backend/internal/config/config_test.go` covering:
2. Production + `DB_SSLMODE=""` => validation error.
3. Production + `DB_SSLMODE="disable"` => validation error.
4. Production + `DB_SSLMODE="require"` => success.
5. Non-production + `DB_SSLMODE="disable"` => success.

### Pagination clamp behavior

1. Extend `backend/internal/server/helpers_test.go`:
2. `limit` above max clamps to `100`.
3. `limit <= 0` falls back to default.
4. Negative `offset` becomes `0`.

### Repository hard caps

1. Extend `backend/internal/repository/comment_test.go`:
2. `ListByPost()` never returns more than 1000 rows.
3. Extend `backend/internal/repository/friend_test.go`:
4. `GetFriends()`, `GetPendingRequests()`, and `GetSentRequests()` never return more than 1000 rows.
5. Validate deterministic ordering in capped results.

### Verification commands

1. `make test-backend`
2. If needed for faster iteration: `cd backend && APP_ENV=test go test ./internal/config ./internal/server ./internal/repository -count=1`

## Rollout and Monitoring

1. Deployment prerequisite: set `DB_SSLMODE` explicitly in production env/config.
2. Watch startup logs for config validation failures after deploy.
3. Watch API latency/error rates on friends/comments list endpoints to confirm caps reduce worst-case load.

## Assumptions and Defaults

- Chosen scope for HIGH-5: `Safety Caps Only`.
- Chosen SSL policy for HIGH-4: disallow only empty/`disable` in production.
- Default cap values for this plan:

1. Pagination max: `100`.
2. Hard query cap for unbounded lists: `1000`.

- Frontend pagination UX is out of scope for this pass.
