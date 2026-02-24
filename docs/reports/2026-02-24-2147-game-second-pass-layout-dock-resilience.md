## Metadata

- Date: `2026-02-24`
- Branch: `othello`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Connect4/Othello responsive layout compaction + game capsule resilience`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "websocket"],
  "Lessons": [
    {
      "title": "Do not drop resumable game state on transient fetch failures",
      "severity": "MEDIUM",
      "anti_pattern": "Removing local resumable-room entries on any query error",
      "detection": "rg -n \"query.status === 'error'\" frontend/src/components/games",
      "prevention": "Only prune tracked room state for authoritative errors (401/403/404) and retain on network/timeouts"
    }
  ]
}
```

## Summary

- Requested a second pass to improve game UX and cross-page resumability behavior.
- Delivered a compacted board-first layout pass for Othello/Connect4 and hardened capsule room tracking behavior.

## Changes Made

- `GameCapsuleDock` now prunes tracked rooms only for authoritative API errors (`401/403/404`) instead of any transient query error.
- Othello layout adjusted so board renders first on smaller screens, with score/turn tiles moved below board and compacted sizing.
- Connect4 layout compacted by removing duplicate large turn banner and constraining board width to fit viewport height more reliably.

Key files touched:
- `frontend/src/components/games/GameCapsuleDock.tsx`
- `frontend/src/pages/games/Othello.tsx`
- `frontend/src/pages/games/ConnectFour.tsx`

## Validation

- Commands run:
  - `make lint-frontend`
  - `cd frontend && bun run type-check`
  - `cd frontend && bun run vitest run src/lib/game-routes.test.ts src/hooks/useManagedWebSocket.test.ts src/hooks/useGameRoomSession.test.tsx`
- Test results:
  - Lint passed
  - Type-check passed
  - 19/19 focused tests passed
- Manual verification:
  - Not run in-browser in this pass.

## Risks and Regressions

- Known risks:
  - Visual tuning can vary by browser chrome height and user zoom level.
- Potential regressions:
  - On very short viewports, chat/sidebar content may still require scrolling.
- Mitigations:
  - Board-first ordering on small screens and viewport-constrained board widths reduce clipping risk.

## Follow-ups

- Remaining work:
  - Optional: shift capsule attention from polling to shared realtime event stream for lower latency and fewer background requests.
- Recommended next steps:
  - Manual QA on 1366x768 and mobile breakpoints for both game pages.

## Rollback Notes

- Revert the three touched frontend files listed above to return to previous behavior.
