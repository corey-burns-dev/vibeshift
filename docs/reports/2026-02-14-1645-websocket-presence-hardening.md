# WebSocket Presence and Heartbeat Hardening Report

## Metadata

- Date: `2026-02-14`
- Branch: `master`
- Author/Agent: `Codex (GPT-5)`
- Scope: `backend websocket presence manager + frontend managed websocket lifecycle`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["backend", "frontend", "websocket", "redis", "auth"],
  "Lessons": [
    {
      "title": "Presence transitions need grace-window debouncing",
      "severity": "MEDIUM",
      "anti_pattern": "Immediate offline broadcast on last socket close causes reconnect flicker",
      "detection": "rg -n \"UnregisterClient|offline|BroadcastGlobalStatus\" backend/internal/notifications",
      "prevention": "Route disconnection through a grace-timer manager and emit offline only after delay without renewed activity."
    },
    {
      "title": "Reconnect policy should be centralized in one hook",
      "severity": "MEDIUM",
      "anti_pattern": "Each hook/provider hand-rolls different reconnect state and backoff behavior",
      "detection": "rg -n \"reconnect|WebSocket|setTimeout\" frontend/src/providers frontend/src/hooks",
      "prevention": "Use a shared managed websocket hook exposing explicit connection state and planned reconnect controls."
    }
  ]
}
```

## Summary

- Requested: implement non-breaking websocket presence/heartbeat hardening across backend and frontend.
- Delivered: added a shared backend Redis-aware `ConnectionManager`, wired it into notification/chat hubs with grace-period offline handling and reaper cleanup, and migrated frontend websocket lifecycle logic to a reusable managed hook with fixed reconnect schedule and planned reconnect control.

## Changes Made

- Backend:
  - Added `backend/internal/notifications/connection_manager.go`.
  - Wired activity heartbeat touch support via `backend/internal/notifications/client.go` (`OnActivity` for pong/message activity).
  - Integrated presence manager into:
    - `backend/internal/notifications/hub.go`
    - `backend/internal/notifications/chat_hub.go`
  - Updated server wiring to pass Redis clients and register notification presence callbacks:
    - `backend/internal/server/server.go`
  - Removed duplicated inline presence emit path in notifications WS handler:
    - `backend/internal/server/example_handlers.go`
- Frontend:
  - Added shared lifecycle hook:
    - `frontend/src/hooks/useManagedWebSocket.ts`
  - Exported it via:
    - `frontend/src/hooks/index.ts`
  - Migrated consumers:
    - `frontend/src/providers/ChatProvider.tsx`
    - `frontend/src/hooks/useRealtimeNotifications.ts`
- Tests:
  - Added backend tests:
    - `backend/internal/notifications/hub_test.go`
  - Expanded backend chat hub tests:
    - `backend/internal/notifications/chat_hub_test.go`
  - Added frontend hook tests:
    - `frontend/src/hooks/useManagedWebSocket.test.ts`
    - `frontend/src/hooks/useRealtimeNotifications.test.tsx`
  - Expanded integration coverage:
    - `frontend/src/providers/ChatProvider.integration.test.tsx`

## Validation

- Commands run:
  - `make test-backend`
  - `make test-frontend`
  - `cd frontend && bun run type-check`
- Test results:
  - Backend tests passed.
  - Frontend tests passed (`41` files, `172` tests).
  - Type-check passed.
- Manual verification:
  - Not performed in browser in this run.

## Risks and Regressions

- Known risks:
  - Presence manager uses Redis `ws:last_seen:<user>` TTL semantics; true global offline across distributed processes still depends on TTL/reaper cadence.
- Potential regressions:
  - Existing websocket reconnect timing changed in migrated frontend paths to fixed `[2s, 5s, 10s]` policy.
- Mitigations:
  - Kept event names/protocol unchanged (`connected_users`, `friends_online_snapshot`).
  - Added regression tests for grace suppression, reconnect sequencing, and server-close recovery.

## Follow-ups

- Remaining work:
  - Add end-to-end environment test that validates distributed/off-node stale presence cleanup behavior.
- Recommended next steps:
  - Add production metrics around presence manager transitions (online/offline reasons and reaper removals).

## Rollback Notes

- Revert backend presence manager integration files and restore previous hub unregister behavior.
- Revert frontend `useManagedWebSocket` migration in `ChatProvider` and `useRealtimeNotifications`.
- Re-run `make test-backend` and `make test-frontend` after rollback.
