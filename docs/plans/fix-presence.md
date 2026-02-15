# Plan: Fix Presence Online/Offline Accuracy + Logout 400

## Summary

- Stabilize and unify presence tracking so status changes propagate immediately across chat, DMs, friends list, and messaging surfaces.
- Fix `/api/auth/logout` request/handler mismatch causing `400 Invalid request body`.
- Remove race conditions between notification and chat WebSocket presence managers that currently suppress offline transitions.
- Tune ping/pong and grace timing for your selected target of roughly 10-second offline detection on abrupt disconnects.

## Root Causes Identified

- `frontend/src/api/client.ts` sends `POST /auth/logout` with `Content-Type: application/json` but no body, while `backend/internal/server/auth_handlers.go` currently rejects empty JSON body in `Logout`.
- Presence is tracked by two separate backend managers:
  - `backend/internal/notifications/hub.go` (notifications WebSocket `/api/ws`)
  - `backend/internal/notifications/chat_hub.go` (chat WebSocket `/api/ws/chat`)
- Both managers use the same Redis presence keys but independent local state/timers (`backend/internal/notifications/connection_manager.go`), which creates cross-hub races where offline callbacks are skipped.
- Offline detection is too slow for abrupt closes due to current heartbeat windows (`backend/internal/notifications/client.go` + presence TTL/reaper timing).
- Frontend presence updates are fragmented by surface; chat events are not globally applied at provider level, so non-chat pages can drift.

## Implementation Plan

## 1. Fix logout contract and make handler tolerant

1. Frontend change in `frontend/src/api/client.ts`:

- Send an explicit JSON body for logout (recommended: `{}`) so requests are always valid with `Content-Type: application/json`.
- Keep existing local cleanup behavior in `finally`.

1. Backend change in `backend/internal/server/auth_handlers.go`:

- Mirror `Refresh` behavior for body parsing:
  - If body is empty, do not fail.
  - If body is present and malformed, return `400 Invalid request body`.
- Keep current token/cookie revocation behavior unchanged.

1. Tests:

- Add backend test case in `backend/internal/server/auth_handlers_test.go` for `POST /logout` with empty body (no JSON payload) returning `200`.
- Add/update frontend unit test (API client) asserting logout sends valid JSON body and does not trigger avoidable 400.

## 2. Eliminate cross-hub presence race (core fix)

1. Refactor presence ownership:

- Use one shared `ConnectionManager` instance for both hubs so online/offline state is aggregated per user across all WS connections.
- Wire it at server construction level (`backend/internal/server/server.go`) and inject into both:
  - notification hub (`Hub`)
  - chat hub (`ChatHub`)

1. Hub interface adjustments:

- Add a setter or constructor path to assign a shared manager in:
  - `backend/internal/notifications/hub.go`
  - `backend/internal/notifications/chat_hub.go`
- Preserve existing register/unregister logic, but both hubs must call into the same manager instance.

1. Callback fanout:

- Shared manager’s online/offline callbacks should invoke both concerns:
  - friend presence events (`notifyFriendsPresence`) for `/api/ws` consumers
  - chat global status broadcast (`ChatHub.BroadcastGlobalStatus`) for `/api/ws/chat` consumers
- Ensure offline emits once per transition and only when all connections for that user are gone.

1. Tests:

- Add/extend tests in:
  - `backend/internal/notifications/hub_test.go`
  - `backend/internal/notifications/chat_hub_test.go`
- New scenario: user connected to both hubs, disconnect one hub -> remain online; disconnect second hub -> single offline event emitted.

## 3. Tune heartbeat/offline timing for ~10s target

1. Backend heartbeat tuning in `backend/internal/notifications/client.go`:

- Reduce ping/pong windows so dead sockets are detected faster.
- Target configuration to achieve ~10-15s worst-case for hard disconnect detection.

1. Presence timing tuning in `backend/internal/notifications/connection_manager.go`:

- Reduce offline grace period (keep small cushion to avoid flap).
- Reduce stale-presence TTL and reaper interval so Redis cleanup does not leave long “ghost online” states.

1. Keep constants configurable:

- Prefer moving these timing values to config defaults to avoid hardcoded operational tuning.
- Maintain safe defaults for dev/prod parity.

## 4. Make frontend presence state globally consistent

1. Apply presence updates in provider layer:

- In `frontend/src/providers/ChatProvider.tsx`, update `usePresenceStore` directly on `user_status` and `connected_users` events, not only via page-level subscribers.
- Keep existing callback subscription model for pages/components.

1. Keep notifications hook as secondary source:

- `frontend/src/hooks/useRealtimeNotifications.ts` can continue handling `friend_presence_changed` and snapshots.
- Ensure updates are idempotent in store operations (`setOnline`/`setOffline` already safe).

1. Ensure logout/route transitions clear local presence store predictably:

- Preserve `resetClientSessionState` behavior in `frontend/src/lib/session-reset.ts`.

## 5. Validation and acceptance

1. Backend automated checks:

- Run focused tests for auth/logout and notifications/chat presence packages.
- Then run normal backend suite target for touched surfaces.

1. Frontend automated checks:

- Run tests for auth hooks/API client and any presence-related hook/provider tests.
- Run type-check.

1. Manual scenario matrix (required):

- Two browsers, two users:
  - User A logs in -> User B sees A online in chat, DM list, friends list.
  - User A logs out from UI -> User B sees A offline within target SLA.
  - User A closes tab/window without logout -> User B sees offline within target SLA.
  - User A reconnects quickly -> no false offline/online flapping.
  - User A with two tabs open, closes one tab -> remains online.
  - User A closes final tab -> goes offline.

## Public API / Interface Changes

- HTTP behavior change:
  - `POST /api/auth/logout` will accept empty request bodies (still accepts `refresh_token` when provided).
- Internal interface changes:
  - Notifications `Hub` and `ChatHub` constructors or setters will support shared `ConnectionManager` injection.
- No breaking frontend component prop/type contract changes expected.

## Test Cases and Scenarios

- `Logout accepts empty body`: `200` response, cookie clearing still works.
- `Malformed non-empty logout body`: still `400`.
- `Shared presence manager multi-hub`: offline only after all hub connections for user are closed.
- `Presence callback single-fire`: no duplicate offline events.
- `Heartbeat timeout path`: abrupt disconnect transitions offline within configured SLA.
- `Frontend global presence sync`: friend/chat surfaces update without requiring Chat page mount.

## Assumptions and Defaults

- Selected default: target offline update around 10 seconds for abrupt disconnects.
- Presence semantics: a user is “online” if any authenticated real-time socket is connected; “offline” only when all are disconnected and grace expires.
- Keep existing UX behavior for notifications/toasts unless presence correctness requires minor dedupe.
- No schema migration required.
