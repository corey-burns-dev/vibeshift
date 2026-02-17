# Game "Play Again" Stale Join State Fix

## Metadata

- Date: `2026-02-17`
- Branch: master (uncommitted)
- Author/Agent: Claude Opus 4.6
- Scope: Frontend — game room session hook, play-again/rematch flow

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "websocket"],
  "Lessons": [
    {
      "title": "Mutable refs must be reset when their identity-key prop changes",
      "severity": "HIGH",
      "anti_pattern": "useRef values (hasJoinedRef, shouldAutoJoinRef) survive prop changes in the same component instance, causing stale state when roomId changes via navigation",
      "detection": "rg -n 'useRef.*false|useRef.*true' frontend/src/hooks/useGameRoomSession.ts",
      "prevention": "Add a useEffect that resets identity-bound refs whenever the key prop (roomId) changes"
    },
    {
      "title": "WebSocket endpoint must reconnect when the resource identifier changes",
      "severity": "HIGH",
      "anti_pattern": "useManagedWebSocket only reconnects on enabled toggle or explicit reconnect() — changing the URL-bearing prop (roomId) without triggering reconnect leaves the socket connected to the old room",
      "detection": "rg -n 'createTicketedWS.*room_id' frontend/src/hooks/useGameRoomSession.ts",
      "prevention": "Track previous roomId and call reconnect(true) when it changes, similar to the existing token-rotation reconnect"
    }
  ]
}
```

## Summary

- **Requested:** Investigate and add test coverage for a bug where both players click "Play Again" after a finished Connect Four game, but the second player fails to join the new room and is no longer shown as in-game.
- **Delivered:** Identified root cause (two-part bug in `useGameRoomSession`), implemented fix, and added 5 new unit tests covering the rematch flow and related edge cases.

## Root Cause Analysis

When a game finishes and both players click "Play Again", the `ConnectFour` component navigates from `/games/connect4/{oldId}` to `/games/connect4/{newId}`. Because both URLs match the same route, React **re-uses the component instance** — only the `id` URL param changes.

Inside `useGameRoomSession`, two problems prevented the second player from joining the new room:

### Problem 1: Stale `hasJoinedRef`

`hasJoinedRef` (a `useRef(false)`) was set to `true` when the player joined the first room. When `roomId` changed to the new room, **the ref was never reset**. This caused:

- The auto-join effect (line ~220) to skip because `!hasJoinedRef.current` was `false`
- The `joinRoom()` function (line ~203) to short-circuit with `return true` (thinks it already joined)

### Problem 2: No WebSocket Reconnect

`useManagedWebSocket` only creates a new socket when `enabled` toggles or `reconnect()` is called. When `roomId` changed from 100→200:

- `wsEnabled = !!roomId && !!token` stayed `true` (both values are truthy)
- The `createSocket` function reference updated (captures new roomId), but no reconnect was triggered
- The WebSocket stayed connected to the **old room's endpoint** (`/api/ws/game?room_id=100`)
- Any join message sent would go to the wrong room

### Combined Effect

The second player navigates to the new room, the WebSocket is still on the old room, `hasJoinedRef` thinks it already joined, and no `join_room` message is ever sent. The player appears disconnected from the new game.

## Changes Made

### `frontend/src/hooks/useGameRoomSession.ts`

1. **Added `previousRoomIdRef`** (line 49) — tracks the previous roomId to detect changes.

2. **Added roomId-change effect** (lines 136–150) — when roomId changes:
   - Resets `hasJoinedRef.current = false`
   - Resets `shouldAutoJoinRef.current = false`
   - Calls `setPlannedReconnect(true)` + `reconnect(true)` to close the old WebSocket and open a new one pointing at the new room's endpoint

   This mirrors the existing token-rotation reconnect pattern (lines ~243–251).

### `frontend/src/hooks/useGameRoomSession.test.tsx`

Added 5 new test cases:

| Test | Coverage |
|------|----------|
| `resets join state when roomId changes (play-again flow)` | Core bug: verifies auto-join fires on new room after finishing a game in old room |
| `allows manual joinRoom after roomId change even if previously joined` | Verifies `joinRoom()` isn't blocked by stale `hasJoinedRef` from previous room |
| `does not auto-join when current user is the creator` | Creator waits for opponent; no self-join |
| `does not auto-join an active room (already started)` | Non-participant spectators don't trigger join on in-progress games |
| `dispatches incoming messages to the onAction callback` | WebSocket messages reach the `onAction` handler correctly |

## Validation

- Commands run:
  - `bunx vitest run src/hooks/useGameRoomSession.test.tsx` — **9/9 tests pass** (4 existing + 5 new)
  - `bunx vitest run` — **186/186 tests pass** across 42 test files (no regressions)
  - `bun run type-check` — no new type errors (pre-existing errors in playwright config and test globals unchanged)

- Manual verification:
  - Not yet performed. Recommended: two-browser test of full play-again flow (see Follow-ups).

## Risks and Regressions

- **Known risks:**
  - The reconnect on roomId change adds a brief disconnect/reconnect cycle when navigating between rooms. This should be imperceptible to users but could cause a flash if the new connection is slow.

- **Potential regressions:**
  - If any code path depends on the WebSocket staying connected across room changes (unlikely given the room-scoped endpoint), it would break. No such pattern was found in the codebase.
  - The `leaveGameRoom` cleanup (lines 253–282) runs when roomId changes. For finished rooms, the backend returns early with no-op (status already "finished"), so this is safe.

- **Mitigations:**
  - The `setPlannedReconnect(true)` flag ensures `useManagedWebSocket` treats the close as intentional (not an error), avoiding spurious error callbacks.
  - The `previousRoomIdRef` guard (`prevId != null && roomId != null && prevId !== roomId`) prevents reconnect on initial mount or when roomId becomes null.

## Follow-ups

- **Manual E2E verification:** Open two browser sessions, complete a Connect Four game, have both players click "Play Again", verify both land in the same new room and the game starts.
- **Race condition in `handlePlayAgain`:** If both players click "Play Again" simultaneously before either creates a room, they may each create separate pending rooms and end up waiting for each other. Consider adding a short delay or retry loop that checks for the opponent's pending room.
- **Consider a `useGameRoomSession` integration test** that simulates the full ConnectFour component lifecycle including `handlePlayAgain` navigation.

## Rollback Notes

- Revert the two changed files to their previous state:
  - `git checkout HEAD -- frontend/src/hooks/useGameRoomSession.ts`
  - `git checkout HEAD -- frontend/src/hooks/useGameRoomSession.test.tsx`
- The bug (second player not joining on rematch) will return but no other functionality is affected.
