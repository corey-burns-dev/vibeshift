## Metadata

- Date: `2026-02-24`
- Branch: `othello`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Push-based game capsule updates via global realtime websocket`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "backend", "websocket"],
  "Lessons": [
    {
      "title": "Use participant-targeted realtime events instead of polling for room status",
      "severity": "MEDIUM",
      "anti_pattern": "Polling game room API on intervals from global UI capsules",
      "detection": "rg -n \"refetchInterval\" frontend/src/components/games/GameCapsuleDock.tsx",
      "prevention": "Publish game_room_updated events to participants over notification websocket and refetch room data on event"
    }
  ]
}
```

## Summary

- Requested: replace polling-based game capsule attention updates with push/realtime behavior.
- Delivered: backend emits `game_room_updated` events to game participants; frontend notifications forwards those to a shared browser event; capsule dock now refetches affected rooms on push and no longer uses interval polling.

## Changes Made

- Backend:
  - Added `EventGameRoomUpdated` and shared participant-publish helper in `realtime_events.go`.
  - `WebSocketGameHandler` now publishes room updates after `join_room` and `make_move` actions.
  - `LeaveGameRoom` now publishes `game_room_updated` when a room is cancelled.
- Frontend:
  - Added `game-realtime-events` module for app-wide game room update dispatch/listen.
  - `useRealtimeNotifications` now handles `game_room_updated` and dispatches app event.
  - `useRealtimeNotifications` now emits a global game refresh event on websocket open to recover from missed updates during reconnect windows.
  - `GameCapsuleDock` now listens for realtime game update events and invalidates room queries by room id.
  - Removed interval polling (`refetchInterval`) from capsule room queries.

Key files touched:
- `backend/internal/server/realtime_events.go`
- `backend/internal/server/game_handlers.go`
- `frontend/src/lib/game-realtime-events.ts`
- `frontend/src/hooks/useRealtimeNotifications.ts`
- `frontend/src/components/games/GameCapsuleDock.tsx`
- `frontend/src/hooks/useRealtimeNotifications.test.tsx`

## Validation

- Commands run:
  - `make lint-frontend`
  - `cd frontend && bun run type-check`
  - `cd frontend && bun run vitest run src/hooks/useRealtimeNotifications.test.tsx src/lib/game-routes.test.ts src/hooks/useManagedWebSocket.test.ts src/hooks/useGameRoomSession.test.tsx`
  - `cd backend && go test ./internal/server ./internal/notifications`
- Test results:
  - Frontend lint passed
  - Frontend type-check passed
  - Frontend focused tests passed (`22/22`)
  - Backend package tests passed for touched areas
- Manual verification:
  - Not run in-browser in this pass.

## Risks and Regressions

- Known risks:
  - If a game update event is missed (temporary websocket disconnect), capsule room status refresh depends on normal query refresh triggers (mount/focus/manual invalidation).
- Potential regressions:
  - Increased notification event volume for active games (participant-scoped only).
- Mitigations:
  - Event payload is lightweight and scoped to creator/opponent only.
  - Capsule still fetches canonical room state before deriving attention indicators.

## Follow-ups

- Remaining work:
  - Optional: add a small debounce window around repeated `game_room_updated` invalidations during rapid move bursts.
- Recommended next steps:
  - Manual QA: open game, navigate away, make move from second account, verify capsule animates without periodic polling.

## Rollback Notes

- Revert the listed backend/frontend files to restore polling-based capsule behavior.
