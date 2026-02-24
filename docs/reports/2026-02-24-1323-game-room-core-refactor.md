## Metadata

- Date: `2026-02-24`
- Branch: `master`
- Author/Agent: `Codex (GPT-5)`
- Scope: `frontend game architecture refactor for ConnectFour/Othello shared lifecycle`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "websocket"],
  "Lessons": [
    {
      "title": "Keep board logic local while centralizing room lifecycle",
      "severity": "MEDIUM",
      "anti_pattern": "Per-game pages duplicate socket cancel handling, rematch/leave flows, and query invalidation logic.",
      "detection": "rg -n \"game_cancelled|handlePlayAgain|showRematchDialog|GAME_ROOM_REALTIME_EVENT\" frontend/src/pages/games/ConnectFour.tsx frontend/src/pages/games/Othello.tsx",
      "prevention": "Use a shared core hook for room/session lifecycle and keep only board parsing/rendering in each game page."
    }
  ]
}
```

## Summary

- Requested: implement the `docs/plans/fix-games.md` game-structure abstraction plan.
- Delivered: extracted shared game lifecycle/audio/effects/dialog logic into reusable hook/components and refactored ConnectFour/Othello to keep only game-specific board logic.

## Changes Made

- Added shared library files:
  - `frontend/src/lib/game-audio.ts`
  - `frontend/src/lib/game-effects.ts`
- Added shared UI components:
  - `frontend/src/components/games/GameResultOverlay.tsx`
  - `frontend/src/components/games/RematchDialog.tsx`
  - `frontend/src/components/games/LeaveGameDialog.tsx`
- Added shared lifecycle hook:
  - `frontend/src/hooks/useGameRoomCore.ts`
- Refactored game pages to consume the shared hook/components:
  - `frontend/src/pages/games/ConnectFour.tsx`
  - `frontend/src/pages/games/Othello.tsx`
- Exported hook from hook barrel:
  - `frontend/src/hooks/index.ts`

## Validation

- Commands run:
  - `make lint-frontend`
  - `cd frontend && bun run type-check`
  - `make test-frontend`
- Test results:
  - Frontend lint passed.
  - TypeScript type-check passed.
  - Frontend tests passed (`59` files, `246` tests).
- Manual verification:
  - Not run in this session.

## Risks and Regressions

- Known risks:
  - Shared hook now controls more state; mistakes there affect both games.
- Potential regressions:
  - Toast text/casing differences between game-specific events.
  - Timing interactions around rematch dialog and overlay transitions.
- Mitigations:
  - Preserved existing event handling semantics (cancel, chat, error, reconnect invalidation).
  - Retained per-game board parsing/move rules in page-local logic.
  - Full frontend test suite run after refactor.

## Follow-ups

- Remaining work:
  - Add dedicated tests for `useGameRoomCore` (cancel flow, rematch flow, local leave guard).
- Recommended next steps:
  - Migrate additional games (Chess, Checkers) to `useGameRoomCore` pattern incrementally.

## Rollback Notes

- Revert safely by restoring:
  - `frontend/src/pages/games/ConnectFour.tsx`
  - `frontend/src/pages/games/Othello.tsx`
  - and removing new shared files (`useGameRoomCore`, new game components, new lib helpers) in the same commit.
