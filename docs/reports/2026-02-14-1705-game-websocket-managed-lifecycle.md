# Game WebSocket Lifecycle Alignment Report

## Metadata

- Date: `2026-02-14`
- Branch: `master`
- Author/Agent: `Codex (GPT-5)`
- Scope: `frontend game websocket session lifecycle alignment with managed websocket hardening`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "websocket", "auth"],
  "Lessons": [
    {
      "title": "Realtime hardening should include all websocket entrypoints",
      "severity": "MEDIUM",
      "anti_pattern": "Hardening chat/notifications only leaves game socket on divergent reconnect/auth behavior",
      "detection": "rg -n \"new WebSocket|createTicketedWS|reconnect\" frontend/src/hooks frontend/src/providers",
      "prevention": "Route every websocket feature hook through shared managed lifecycle hook and add feature-specific regression tests."
    }
  ]
}
```

## Summary

- Requested: cover remaining friends/games realtime bases after initial websocket hardening.
- Delivered: migrated game room websocket hook to the managed websocket lifecycle, added heartbeat `PING`/`PONG` auto-response in shared hook, and added game hook regression tests for join/reconnect/token-rotation behavior.

## Changes Made

- Shared hook:
  - Updated `frontend/src/hooks/useManagedWebSocket.ts` to auto-respond to inbound `PING` messages with `PONG` (supports both raw and JSON message forms).
  - Expanded `frontend/src/hooks/useManagedWebSocket.test.ts` with `PING`/`PONG` coverage.
- Game hook migration:
  - Refactored `frontend/src/hooks/useGameRoomSession.ts` to use `useManagedWebSocket` with fixed reconnect delays (`2s`, `5s`, `10s`, then capped at `10s`).
  - Added planned reconnect on token rotation for game sessions.
  - Preserved existing game semantics: queued manual join intent, pending-room auto-join, and leave-room cleanup on unload/unmount.
- New tests:
  - Added `frontend/src/hooks/useGameRoomSession.test.tsx`.
  - Covered queued join during connect, auto-join on open, send-action gating until open, and token-rotation planned reconnect.

## Validation

- Commands run:
  - `cd frontend && bun run test:run src/hooks/useManagedWebSocket.test.ts src/hooks/useGameRoomSession.test.tsx`
  - `make test-frontend`
  - `cd frontend && bun run type-check`
  - `make test-backend`
- Test results:
  - Frontend targeted and full suites passed.
  - Frontend type-check passed.
  - Backend tests passed.
- Manual verification:
  - Not performed in browser in this run.

## Risks and Regressions

- Known risks:
  - `PING` messages are now consumed at the managed hook layer; if any feature expected to process `PING` payloads as business events, that would now be suppressed.
- Potential regressions:
  - Game reconnect policy moved from old bounded exponential attempts to shared fixed-delay unlimited reconnect behavior.
- Mitigations:
  - Added explicit hook tests for game reconnect and join behavior.
  - Kept game socket protocol/event names unchanged.

## Follow-ups

- Remaining work:
  - Add integration test coverage for `/api/ws/game` close/restart recovery from page-level game components.
- Recommended next steps:
  - Instrument reconnect attempt counters in UI telemetry for game sessions.

## Rollback Notes

- Revert `frontend/src/hooks/useGameRoomSession.ts` to previous bespoke connection management.
- Revert `frontend/src/hooks/useManagedWebSocket.ts` `PING`/`PONG` handling changes.
- Remove new hook tests if rolling back behavior.
- Re-run `make test-frontend` and `cd frontend && bun run type-check`.
