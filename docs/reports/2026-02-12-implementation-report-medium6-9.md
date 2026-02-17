# Implementation Report: MEDIUM-6 Through MEDIUM-9 (2026-02-12)

## Summary

Successfully implemented and verified the four production-grade improvements identified in the Deep Production Review. These changes enhance database integrity, system security, operational observability, and performance through caching.

## Implemented Changes

### 1. MEDIUM-6: Game FK ON DELETE Behavior

- **Database:** Added migration `000008_game_fk_updates.up.sql` to set `ON DELETE SET NULL` on `game_rooms` (creator, opponent, winner) and `ON DELETE CASCADE` on `game_moves`.
- **Backend Models:** Updated `models.GameRoom` to make `CreatorID` a `*uint` (nullable).
- **Logic:** Updated `GameService` and `GameHub` to handle cases where `CreatorID` or other participant IDs are null.
- **Frontend:**
  - Updated `GameRoom` type definition in `api/types.ts`.
  - Hardened `Games.tsx` and `ConnectFour.tsx` to handle "Deleted User" scenarios and filter out rooms with missing creators.
  - Updated `useGameRoomSession` and `useUserActions` hooks for null safety.

### 2. MEDIUM-7: Error Detail Leakage Control

- **Security:** Modified `RespondWithError` in `backend/internal/models/errors.go`.
- **Behavior:** `Details` and raw internal error messages are now only exposed when `APP_ENV` is set to `development` or is empty. In production, a generic "Internal server error" is returned for non-application errors.

### 3. MEDIUM-8: WebSocket Backpressure Observability

- **Metrics:** Added `sanctum_websocket_backpressure_drops_total` counter in `backend/internal/observability/metrics.go` with `hub` and `reason` labels.
- **Instrumentation:**
  - Updated `WSHub` interface to require `Name()`.
  - Instrumented `Client.TrySend` to increment metrics on buffer full ("full") or closed channel ("closed").
  - Normalized `Hub` broadcast paths to use `TrySend`.
- **Alerting:** Updated `infra/prometheus/alerts.yml` to use the new metric name.

### 4. MEDIUM-9: Cache Hot List Paths

- **Infrastructure:** Updated `backend/internal/cache/inventory.go` with new keys for user conversations, chatroom lists, and global post feeds. Added versioning support for global list invalidation.
- **Caching Logic:**
  - Implemented cache-aside in `chatRepository.GetUserConversations`.
  - Implemented cache-aside in `ChatService.GetAllChatrooms`.
  - Implemented cache-aside in `PostService.ListPosts` (guest view cached globally, then enriched with user-specific `Liked` status).
- **Invalidation:**
  - Added invalidation on message creation, membership changes, and post mutations (create/delete/like/unlike).

## Verification Results

- **Backend Tests:** All suites passed (`make test-backend`).
- **Frontend Tests:** All suites passed (`npm test`).
- **Build:** Verified all components build correctly following the model pointer changes.

## Files Modified

- `backend/internal/database/migrations/000008_game_fk_updates.up.sql`
- `backend/internal/database/migrations/000008_game_fk_updates.down.sql`
- `backend/internal/models/game.go`
- `backend/internal/models/errors.go`
- `backend/internal/service/game_service.go`
- `backend/internal/notifications/game_hub.go`
- `backend/internal/notifications/client.go`
- `backend/internal/notifications/hub.go`
- `backend/internal/observability/metrics.go`
- `backend/internal/cache/inventory.go`
- `backend/internal/repository/chat.go`
- `backend/internal/repository/post.go`
- `backend/internal/service/chat_service.go`
- `backend/internal/service/post_service.go`
- `backend/internal/seed/factories.go`
- `infra/prometheus/alerts.yml`
- `frontend/src/api/types.ts`
- `frontend/src/pages/Games.tsx`
- `frontend/src/pages/games/ConnectFour.tsx`
- `frontend/src/hooks/useGameRoomSession.ts`
- `frontend/src/hooks/useUserActions.ts`
- Various test files in `backend/internal/...`
