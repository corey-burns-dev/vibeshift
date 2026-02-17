# Plan: Implement MEDIUM-1/2/3/4/5/10 (Remaining Deep-Review Findings)

## Summary

This pass delivers the six remaining medium findings with one coordinated backend/frontend hardening plan:

1. `MEDIUM-3` atomic WebSocket ticket consumption (`GETDEL`) to enforce single-use.
2. `MEDIUM-5` transactional poll creation to prevent partial poll writes.
3. `MEDIUM-10` targeted extraction of admin moderation query logic into `ModerationService`.
4. `MEDIUM-1` admin user-detail warning surfacing + server-side logging for partial-data failures.
5. `MEDIUM-4` production compose resource limits with balanced defaults.
6. `MEDIUM-2` access-token migration from `localStorage` to in-memory session flow with refresh-cookie bootstrap.

## Public API / Interface / Type Changes

1. `GET /api/admin/users/:id` response adds optional `warnings: string[]` when supplementary admin detail data is partially unavailable.
2. Frontend type `AdminUserDetailResponse` gains optional `warnings?: string[]`.
3. Frontend internal auth contract changes:
`access token` moves to in-memory store; `user` remains persisted in `localStorage`.
4. No route/path changes and no request-payload contract changes.

## Implementation Plan

### 1) MEDIUM-3: Atomic WebSocket Ticket Validation

1. Update `backend/internal/server/server.go` in `AuthRequired()` to use Redis `GETDEL` for ticket validation on WS paths.
2. Remove deferred ticket deletion from WS handlers since consumption is now atomic in middleware:
`backend/internal/server/websocket_handlers.go`,
`backend/internal/server/game_handlers.go`,
`backend/internal/server/example_handlers.go`.
3. Keep existing failure semantics: invalid/expired WS ticket returns `401`.

### 2) MEDIUM-5: Poll Creation Transaction

1. Update `backend/internal/repository/poll.go` `Create()` to wrap poll + options insertions in `db.Transaction(...)`.
2. Ensure in-transaction option accumulation and assign final `poll.Options` only on commit path.
3. Return error unchanged so callers keep current behavior.

### 3) MEDIUM-10 + MEDIUM-1: ModerationService Extraction + Warnings

1. Add `backend/internal/service/moderation_service.go` with targeted methods:
`GetAdminBanRequests(ctx, limit, offset)`,
`GetAdminUserDetail(ctx, userID)`.
2. Add server wiring in `backend/internal/server/server.go` and `NewServerWithDeps` for a `moderationService` field.
3. Move `GetAdminBanRequests` aggregation query and user hydration from handler into service.
4. Move `GetAdminUserDetail` multi-query logic into service and keep primary user fetch hard-fail behavior.
5. For supplementary query failures (reports, mutes, blocks given/received), service will:
log structured `log.Printf(...)` warnings with user ID and query name,
return partial data plus `warnings[]` entries.
6. Update `backend/internal/server/moderation_handlers.go` handlers to call service methods and return service DTO results.
7. Update frontend admin detail UI to render warning banner when `warnings` exists:
`frontend/src/pages/admin/AdminUserDetail.tsx`.
8. Update frontend type:
`frontend/src/api/types.ts` (`AdminUserDetailResponse.warnings?: string[]`).

### 4) MEDIUM-4: Resource Limits in production compose overrides

1. Add `deploy.resources.limits` to each prod service in the production compose overrides.
2. Use balanced defaults:
`app: 1.00 CPU / 768M`,
`postgres: 1.50 CPU / 1G`,
`redis: 0.50 CPU / 256M`,
`frontend: 0.50 CPU / 256M`.
3. Keep current restart/logging behavior unchanged in this pass.

### 5) MEDIUM-2: Access Token Out of localStorage (In-Memory Refresh Flow)

1. Introduce frontend in-memory auth session store/module (new file):
`frontend/src/stores/useAuthSessionStore.ts` (or equivalent single auth module).
2. Migrate token operations:
`frontend/src/api/client.ts` reads/writes access token from in-memory store, never `localStorage`.
3. Add refresh single-flight in API client to prevent parallel refresh storms.
4. Change 401 handling to allow refresh attempt even when no in-memory token is present (cookie bootstrap case), excluding auth endpoints.
5. Keep user profile persisted in `localStorage`; remove only token persistence.
6. Add legacy cleanup: if old `localStorage.token` exists, move to memory once at startup and delete persisted key immediately.
7. Update hooks/components that gate on token persistence:
`frontend/src/hooks/useAuth.ts`,
`frontend/src/hooks/useUsers.ts`,
`frontend/src/hooks/useRealtimeNotifications.ts`,
`frontend/src/hooks/useGameRoomSession.ts`,
`frontend/src/pages/games/ConnectFour.tsx`,
`frontend/src/lib/handleAuthOrFKError.ts`.
8. Preserve current UX: hard refresh should still recover session via refresh cookie and retry path.

## Test Cases and Scenarios

1. Backend WS ticket tests (`backend/internal/server/middleware_test.go`):
first WS request with ticket succeeds; second reuse fails with `401`.
2. Backend poll repo tests (new `backend/internal/repository/poll_test.go`):
successful create commits poll+options;
failure during option insert rolls back poll row and option rows.
3. Backend moderation service tests (new `backend/internal/service/moderation_service_test.go`):
ban-request aggregation ordering and user hydration;
admin user detail returns warnings on supplementary query failures.
4. Backend handler tests (`backend/internal/server/moderation_handlers_test.go`):
`GetAdminUserDetail` includes `warnings` field when partial loads fail.
5. Frontend auth tests:
`frontend/src/hooks/useAuth.test.tsx` updated for in-memory token behavior;
`frontend/src/hooks/useUsers.test.tsx` updated for no token persistence dependency;
`frontend/src/api/client.test.ts` adds refresh bootstrap/retry behavior.
6. Frontend admin detail rendering test (or component-level assertion) for warning banner display.
7. Compose validation:
`docker compose -f compose.yml config` passes with new limits (prod overlay removed).

## Rollout Order

1. PR-1: `MEDIUM-3` WS atomic ticket fix + tests.
2. PR-2: `MEDIUM-5` poll transaction + repo tests.
3. PR-3: `MEDIUM-10` targeted ModerationService extraction + `MEDIUM-1` warnings/logging + tests + frontend type/UI update.
4. PR-4: `MEDIUM-4` compose prod resource limits.
5. PR-5: `MEDIUM-2` frontend auth token in-memory migration + refresh bootstrap + frontend test updates.

## Assumptions and Defaults

1. `MEDIUM-10` scope is targeted extraction (admin aggregation/detail paths), not full moderation rewrite.
2. `MEDIUM-2` keeps `user` persisted, but removes all persistent storage for access tokens.
3. `MEDIUM-4` uses balanced single-host production limits listed above.
4. No new external dependencies are required.
5. Existing endpoint paths and auth cookie model remain unchanged.
