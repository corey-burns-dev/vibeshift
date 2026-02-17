# Plan: Implement MEDIUM-6 Through MEDIUM-9 (Deep Production Review, 2026-02-12)

## Summary

We will deliver this as **4 focused PRs**, one per finding, in issue order (`MEDIUM-6`, `MEDIUM-7`, `MEDIUM-8`, `MEDIUM-9`).  
The plan keeps architecture patterns intact, adds tests with each PR, and includes rollout/validation steps so each PR is independently shippable.

## Public APIs / Interfaces / Types (Planned Changes)

1. `GameRoom` API shape becomes nullable for deleted-user references: `creator_id`, `opponent_id`, `winner_id` can be null/omitted when related users are deleted; frontend types and guards will be updated accordingly.
2. Internal WebSocket hub interface in notifications will require `Name()` in addition to unregister behavior so metrics can be labeled by hub.
3. New Prometheus metrics for websocket backpressure/drops will be emitted from send paths.
4. No route/path changes are planned; response envelope for `ErrorResponse` is unchanged, but `details` exposure becomes environment-gated.

## Implementation Plan (Four PRs)

1. **PR-1: MEDIUM-6 (Game FK ON DELETE behavior)**
   Scope: add migration `000008` to enforce `ON DELETE SET NULL` on `game_rooms` user FKs and `ON DELETE CASCADE` on `game_moves.user_id`; align models and runtime logic to nullable creator/opponent/winner references.  
   Files: `backend/internal/database/migrations/000008_*.sql`, `backend/internal/models/game.go`, `backend/internal/service/game_service.go`, `backend/internal/repository/game.go`, `backend/internal/notifications/game_hub.go`, affected tests in `backend/internal/service/*_test.go` and `backend/internal/notifications/*_test.go`, frontend game types/guards in `frontend/src/api/types.ts`, `frontend/src/hooks/useGameRoomSession.ts`, `frontend/src/hooks/useUserActions.ts`, `frontend/src/pages/Games.tsx`, `frontend/src/pages/games/ConnectFour.tsx`.  
   Data/compat rules: migration `up` will drop/recreate FK constraints and make `creator_id` nullable; migration `down` will explicitly handle nullable creator rows before restoring `NOT NULL` (documented destructive rollback behavior).  
   Acceptance: user deletion no longer violates game FK constraints; game endpoints remain stable when related users are deleted; frontend handles nullable game participant IDs safely.

2. **PR-2: MEDIUM-7 (Error detail leakage control)**
   Scope: change `RespondWithError` so `details` is only returned when `APP_ENV == "development"`; preserve current status-code mapping and error response shape.  
   Files: `backend/internal/models/errors.go`, new tests in `backend/internal/models/errors_test.go`.  
   Behavior: production/test/staging responses do not expose wrapped internal error details; development still includes details for debugging.  
   Acceptance: environment-based tests verify `details` visibility rules and request ID behavior.

3. **PR-3: MEDIUM-8 (WebSocket backpressure observability)**
   Scope: instrument message drop paths and buffer pressure with Prometheus metrics; normalize all hub send paths through a single send helper so drop accounting is complete.  
   Files: `backend/internal/notifications/client.go`, `backend/internal/notifications/hub.go`, `backend/internal/observability/metrics.go` (or equivalent metrics home), tests in `backend/internal/notifications/client_test.go` plus hub test touchups, optional alert expression update in `infra/prometheus/alerts.yml` if metric name alignment is needed.  
   Metric contract: expose a drop counter compatible with current alerting intent (`ws_backpressure_drops_total`) and include hub/reason labels; add send-attempt and buffer-utilization telemetry for operational visibility.  
   Acceptance: full-buffer and closed-channel cases increment metrics; no blocking regressions in websocket hubs.

4. **PR-4: MEDIUM-9 (Cache hot list paths)**
   Scope: add cache-aside for `GetUserConversations`, `GetAllChatrooms`, and `ListPosts` with explicit key format, TTL, and invalidation/versioning strategy.  
   Files: `backend/internal/cache/inventory.go`, `backend/internal/cache/helper.go` and/or `backend/internal/cache/redis.go` (version helpers), `backend/internal/repository/chat.go`, `backend/internal/service/chat_service.go`, `backend/internal/service/post_service.go`, targeted tests in chat/post service/repository test files, optional doc update in `backend/docs/REDIS_BEST_PRACTICES.md`.  
   Cache decisions: use 2-minute TTL for these list caches; user conversation/chatroom list invalidation is explicit on membership/message/read mutations; feed list caching uses versioned keys (global + sanctum version bumps) to avoid wildcard deletes.  
   Acceptance: repeated reads hit cache; mutation paths invalidate/bump versions correctly; stale windows are bounded and intentional.

## Test Cases and Validation Scenarios

1. Migration integrity: verify FK `confdeltype` for all changed constraints and nullability changes in `game_rooms`; verify rollback behavior on nullable creator rows.
2. Game runtime resilience: fetch/join/leave/update flows when creator/opponent/winner references are null after user deletion.
3. Error response security: same handler error in `development` vs `production` confirms `details` gating.
4. Websocket backpressure: full send buffer and closed channel both produce expected metric increments and non-blocking behavior.
5. Cache behavior: hit/miss correctness, mutation-triggered invalidation/version bump correctness, and short-TTL fallback behavior when Redis is unavailable.
6. Full regression pass: `make test-backend`, `make test-frontend`, `make db-schema-status`, `make swagger` (if generated API artifacts are maintained).

## Assumptions and Defaults Chosen

1. Scope is exactly `MEDIUM-6`, `MEDIUM-7`, `MEDIUM-8`, `MEDIUM-9`.
2. MEDIUM-6 follows report-strict FK behavior (`SET NULL` for room user FKs, `CASCADE` for `game_moves.user_id`).
3. API/frontend contract is updated to handle nullable game participant IDs (no sentinel `0` workaround).
4. Delivery shape is 4 focused PRs, each independently reviewable and releasable.
5. No new external dependencies are required; use existing Redis/Prometheus/test stack already present in repo.
