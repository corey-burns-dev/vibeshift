# Task Report

## Metadata

- Date: `2026-02-24`
- Branch: `othello`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Add reusable minimized game capsule dock with resume/exit and move-attention behavior for Connect4/Othello`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "websocket"],
  "Lessons": [
    {
      "title": "Session continuity features should live at app-shell level",
      "severity": "HIGH",
      "anti_pattern": "Implementing resume/notification UX inside game pages only",
      "detection": "rg -n \"parseGameRoomPath|GameCapsuleDock\" frontend/src",
      "prevention": "Mount global game-session UI in MainLayout so it survives route changes"
    },
    {
      "title": "Extensibility requires central game-type routing constants",
      "severity": "MEDIUM",
      "anti_pattern": "Hardcoded game route/type checks scattered across files",
      "detection": "rg -n \"connect4|othello\" frontend/src/App.tsx frontend/src/lib",
      "prevention": "Use a shared supported-game route/type helper and derive checks from it"
    }
  ]
}
```

## Summary

- Requested: when leaving a game page, keep a minimized bottom capsule for easy return/exit and alert the user (shake/color) when state changes while they browse elsewhere.
- Delivered: added a reusable app-level game capsule dock with resume and exit actions, live background status polling, and attention animation for changed game state.

## Changes Made

- New global UI component:
  - `frontend/src/components/games/GameCapsuleDock.tsx`
  - Fixed-position capsule stack (mobile + desktop placements) with:
    - `Resume` by clicking capsule.
    - `Exit` via close button (`leaveGameRoom`).
    - Attention state (shake + color) when room signature changes off-route.
    - Status text (`Waiting for opponent`, `Match in progress`, `Your turn`).
- App-shell integration:
  - Mounted `GameCapsuleDock` in `MainLayout` so behavior persists across navigation.
  - Replaced hardcoded game-route regex with shared parser.
- Reusable/extensible routing model:
  - Added `frontend/src/lib/game-routes.ts` + tests.
  - Centralized supported game types (`connect4`, `othello`) and route parsing/building.
- Reusable game-presence tracking:
  - Added `frontend/src/hooks/useResumableGameRoomPresence.ts`.
  - Updated Connect4/Othello pages to use the shared hook instead of duplicated presence logic.
- Presence update signaling:
  - Updated `frontend/src/lib/game-room-presence.ts` to dispatch a custom browser event on writes so dock updates immediately in-tab.

## Validation

- Commands run:
  - `make lint-frontend`
  - `cd frontend && bun run type-check`
  - `cd frontend && bun run vitest run src/lib/game-routes.test.ts`
- Test results:
  - Lint passed.
  - Type-check passed.
  - New helper tests passed (`3/3`).
- Manual verification:
  - Browser/manual interaction check not run in this session.

## Risks and Regressions

- Known risks:
  - Capsule attention is currently powered by periodic room polling (2.5s), not push events.
- Potential regressions:
  - Multiple active rooms can create a taller capsule stack on small screens.
- Mitigations:
  - Component limits source rooms to tracked resumables and hides the currently open room.
  - Caps are small and positioned above mobile bottom nav.

## Follow-ups

- Remaining work:
  - Optional: wire push updates from game websocket layer into global app context to reduce polling.
  - Optional: add component tests for resume/exit/attention transitions.
- Recommended next steps:
  - Manual UX QA on mobile and desktop for overlap with chat dock and bottom nav.

## Rollback Notes

- Revert:
  - `frontend/src/components/games/GameCapsuleDock.tsx`
  - `frontend/src/lib/game-routes.ts`
  - `frontend/src/lib/game-routes.test.ts`
  - `frontend/src/hooks/useResumableGameRoomPresence.ts`
  - `frontend/src/lib/game-room-presence.ts`
  - `frontend/src/App.tsx`
  - `frontend/src/pages/games/ConnectFour.tsx`
  - `frontend/src/pages/games/Othello.tsx`
