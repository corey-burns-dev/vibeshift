# Task Report

## Metadata

- Date: `2026-02-24`
- Branch: `othello`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Comprehensive game UX + realtime hardening for Othello/Connect4 (layout compaction, resumable sessions, global game capsule dock, websocket lifecycle fixes, push updates, and test coverage)`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "backend", "websocket", "auth", "docs"],
  "Lessons": [
    {
      "title": "Route changes should not imply room abandonment",
      "severity": "HIGH",
      "anti_pattern": "Leaving/cancelling game rooms on component unmount or token rotation",
      "detection": "rg -n \"leaveGameRoom|beforeunload\" frontend/src/hooks/useGameRoomSession.ts",
      "prevention": "Keep leave explicit via room-close action and treat disconnect/reconnect as session continuity"
    },
    {
      "title": "Board-heavy game UIs must size by viewport height",
      "severity": "MEDIUM",
      "anti_pattern": "Fixed board sizing and stacked headers forcing browser zoom-out",
      "detection": "rg -n \"h-10 w-10|h-11 w-11|overflow-hidden\" frontend/src/pages/games/ConnectFour.tsx frontend/src/pages/games/Othello.tsx",
      "prevention": "Use viewport-constrained board containers with aspect-square cells and reduced vertical chrome"
    },
    {
      "title": "Global game continuity UX must live in the app shell",
      "severity": "HIGH",
      "anti_pattern": "Keeping resume state and alerts only inside active game pages",
      "detection": "rg -n \"GameCapsuleDock|useResumableGameRoomPresence|parseGameRoomPath\" frontend/src",
      "prevention": "Mount a route-persistent dock in MainLayout and feed it from shared presence/realtime channels"
    },
    {
      "title": "Push updates need correct recipient fanout after state mutation",
      "severity": "HIGH",
      "anti_pattern": "Building recipients from already-mutated cancelled room state",
      "detection": "rg -n \"publishGameRoomUpdated|LeaveGameRoom\" backend/internal/server",
      "prevention": "Capture pre-mutation participant IDs and publish to union(pre + post participant set)"
    }
  ]
}
```

## Summary

- Requested:
  - Restyle Othello so full board fits without requiring zoom-out.
  - Reduce vertical stacking (scores and turn status placement).
  - Ensure easy return to in-progress games after navigating elsewhere.
  - Add minimized cross-site game capsule behavior (resume/exit + move attention cue).
  - Analyze and harden game websocket behavior to modern multiplayer expectations.
  - Ensure tests cover recent changes.
- Delivered:
  - Compact board-first layouts for Othello and Connect4 with less vertical pressure.
  - Reusable resumable-game presence model and global `GameCapsuleDock`.
  - Route-persistent capsule UX with resume, explicit exit, and attention animation.
  - Frontend websocket lifecycle hardening (token rotate, reconnect, room change, join intent recovery).
  - Backend realtime improvements (`game_room_updated`) and participant fanout fix in leave/cancel flow.
  - Expanded focused tests plus full frontend/backend test target validation.

## Problem Framing

The original issues were connected, not isolated:

1. Layout pressure:
   - Othello and Connect4 used too much vertical chrome for shorter desktop heights.
2. Session continuity:
   - Navigating off game pages could feel like abandoning state.
3. Realtime quality:
   - Resume/attention UX initially depended on polling and had reconnect/leave edge cases.

The final design separated concerns:

- Board pages optimize play layout and publish presence intent.
- App shell owns persistent session continuity UI (dock).
- Realtime notifications push targeted room update signals.
- Backend guarantees participant-scoped fanout correctness.

## Architecture Before vs After

Before (high-level):

- Game continuity mostly page-local.
- Route change/unmount could trigger problematic leave semantics.
- Capsule freshness had polling dependence.
- Leave/cancel realtime fanout could miss the non-leaving participant.

After (high-level):

- Presence tracked per-user via local storage + shared custom events.
- Global dock mounted in app shell, independent of current route.
- Push-driven `game_room_updated` invalidation path from backend -> notification websocket -> app event -> dock query invalidation.
- Leave/cancel fanout publishes to both original and current participants.

## Detailed Changes

### 1) Othello and Connect4 layout compaction

Goals:

- Keep full board visible on common short desktops.
- Move non-critical vertical blocks into lateral/compact areas.
- Preserve readability and interaction affordance.

Representative Othello board sizing:

```tsx
<div className='w-[min(100%,calc(100dvh-20rem))] max-w-[26rem] ...'>
  <div className='grid grid-cols-8 ...'>
    <button className='... aspect-square w-full ...' />
  </div>
</div>
```

Representative Connect4 board sizing:

```tsx
const boardWidthClass = 'w-[min(100%,calc(100dvh-20rem))] max-w-[30rem]'
...
<div className={`relative ${boardWidthClass} ...`}>
  <div className='grid grid-cols-7 ...'>
    <button className='... aspect-square w-full ...' />
  </div>
</div>
```

Vertical stacking reduction in Othello:

- Score and turn prompts moved to side rail on large screens.
- Mobile uses compact 2/3-column tiles below board.
- Large banners were reduced to tighter badges and condensed headers.

Files:

- `frontend/src/pages/games/Othello.tsx`
- `frontend/src/pages/games/ConnectFour.tsx`

### 2) Resumable room persistence model

Added reusable storage-backed tracking of active/pending participant rooms:

```ts
export function upsertResumableGameRoom(userId, room) {
  const existing = loadRooms(userId).filter(item => item.roomId !== room.roomId)
  existing.unshift({ ...room, updatedAt: Date.now() })
  saveRooms(userId, existing.slice(0, MAX_TRACKED_ROOMS))
}
```

Presence updates broadcast same-tab and cross-tab signals:

```ts
window.dispatchEvent(
  new CustomEvent(GAME_ROOM_PRESENCE_EVENT, { detail: { userId } })
)
```

Files:

- `frontend/src/lib/game-room-presence.ts`
- `frontend/src/hooks/useResumableGameRoomPresence.ts`

### 3) Reusable hook integration in game pages

Both games now use the same presence hook:

```tsx
useResumableGameRoomPresence({
  userId: currentUser?.id,
  roomId,
  type: 'othello', // or 'connect4'
  status: gameState?.status,
  isParticipant: isCreator || isOpponent,
})
```

This removed duplicated page-level presence logic and made new game onboarding easier.

Files:

- `frontend/src/pages/games/Othello.tsx`
- `frontend/src/pages/games/ConnectFour.tsx`

### 4) Global minimized `GameCapsuleDock`

Created route-persistent capsule stack for resumable rooms with:

- Resume on capsule click.
- Exit action (explicit leave API call).
- Attention state (shake/color) when room state changes off-route.
- Turn-aware status text (`Your turn`, `Waiting for opponent`, `Match in progress`).

Targeted realtime invalidation behavior:

```ts
if (typeof roomId === 'number' && trackedRooms.some(room => room.roomId === roomId)) {
  void queryClient.invalidateQueries({ queryKey: ['gameRoomCapsule', roomId] })
  return
}
if (roomId == null) {
  void queryClient.invalidateQueries({ queryKey: ['gameRoomCapsule'] })
}
```

Attention animation trigger:

```ts
if (previous && previous !== signature && !isCurrentRoom) {
  setAttentionByRoom(current => ({ ...current, [room.id]: true }))
}
```

Files:

- `frontend/src/components/games/GameCapsuleDock.tsx`
- `frontend/src/App.tsx` (mounted in `MainLayout`)

### 5) Route/type extensibility helpers

Centralized supported game types and path helpers:

```ts
export const SUPPORTED_GAME_TYPES = ['connect4', 'othello'] as const
export function buildGameRoomPath(type: SupportedGameType, roomId: number) {
  return `/games/${type}/${roomId}`
}
```

This removed scattered hardcoded route checks and provides one place to extend when new games are added.

Files:

- `frontend/src/lib/game-routes.ts`
- `frontend/src/lib/game-routes.test.ts`

### 6) Frontend websocket lifecycle hardening

Key improvements in `useGameRoomSession`:

- No implicit leave on unmount/refresh/token rotation.
- Planned reconnect when auth token rotates.
- Room-id change reconnect support for play-again flow.
- Join intent recovery after reconnect without duplicate join spam.

Representative logic:

```ts
if (prevId != null && roomId != null && prevId !== roomId) {
  hasJoinedRef.current = false
  shouldAutoJoinRef.current = false
  setPlannedReconnect(true)
  reconnect(true)
}
```

Auto-join only for valid pending/non-creator context:

```ts
if (
  room.status === 'pending' &&
  room.creator_id !== currentUserId &&
  !hasJoinedRef.current
) {
  shouldAutoJoinRef.current = true
}
```

Key improvements in `useManagedWebSocket`:

- Explicit handshake timeout tracking and cleanup.
- Timeout/timer cleanup on close/error/reconnect/unmount.
- Planned reconnect metadata flow.

Representative cleanup:

```ts
const clearHandshakeTimeout = useCallback(() => {
  if (handshakeTimeoutRef.current !== null) {
    window.clearTimeout(handshakeTimeoutRef.current)
    handshakeTimeoutRef.current = null
  }
  handshakeCompletedRef.current = false
}, [])
```

Files:

- `frontend/src/hooks/useGameRoomSession.ts`
- `frontend/src/hooks/useManagedWebSocket.ts`
- `frontend/src/hooks/useGameRoomSession.test.tsx`
- `frontend/src/hooks/useManagedWebSocket.test.ts`

### 7) Backend hub disconnect semantics

Adjusted GameHub unregister behavior so transient socket disconnect does not imply room cancel:

- Remove only registrations matching the exact client instance.
- Do not execute pending-room cancellation on disconnect.
- Preserve state for reconnect/multi-tab replacement scenarios.

Representative logic:

```go
if c, ok := room[userID]; ok && c == client {
    delete(room, userID)
    ...
}
```

Files:

- `backend/internal/notifications/game_hub.go`
- `backend/internal/notifications/game_hub_test.go`

### 8) Push-based room updates (`game_room_updated`)

End-to-end flow:

1. Game action occurs (`join_room`, `make_move`, explicit leave/cancel).
2. Backend publishes participant-scoped `game_room_updated`.
3. Frontend global realtime hook receives event and dispatches app-level browser event.
4. Capsule dock invalidates affected room query and recomputes attention/status.

Backend publish from game websocket handler:

```go
if action.Type == "join_room" || action.Type == "make_move" {
    updatedRoom, err := s.gameSvc().GetGameRoom(opCtx, action.RoomID)
    ...
    s.publishGameRoomUpdated(updatedRoom)
}
```

Frontend dispatch bridge:

```ts
case 'game_room_updated': {
  const roomId = asNumber(payload.room_id)
  dispatchGameRoomRealtimeUpdate({ roomId: roomId ?? undefined })
  break
}
```

Files:

- `backend/internal/server/realtime_events.go`
- `backend/internal/server/game_handlers.go`
- `frontend/src/hooks/useRealtimeNotifications.ts`
- `frontend/src/lib/game-realtime-events.ts`
- `frontend/src/components/games/GameCapsuleDock.tsx`

### 9) Leave/cancel fanout correctness fix

Issue:

- On leave, room status mutation could clear `opponent_id` before recipient derivation.
- Result: opponent might miss `game_room_updated`.

Fix:

- Capture participant ids before mutation.
- Publish to union of pre- and post-mutation participants.

Representative backend logic:

```go
participantIDs := make([]uint, 0, 2)
if currentRoom, getErr := s.gameSvc().GetGameRoom(ctx, roomID); getErr == nil && currentRoom != nil {
    if currentRoom.CreatorID != nil {
        participantIDs = append(participantIDs, *currentRoom.CreatorID)
    }
    if currentRoom.OpponentID != nil {
        participantIDs = append(participantIDs, *currentRoom.OpponentID)
    }
}
...
s.publishGameRoomUpdatedToParticipants(room, participantIDs...)
```

Files:

- `backend/internal/server/game_handlers.go`
- `backend/internal/server/realtime_events.go`
- `backend/internal/server/game_handlers_realtime_test.go`

## Test Coverage Added and Why

### Frontend

- `GameCapsuleDock.test.tsx`
  - Confirms no polling interval configuration remains.
  - Confirms targeted invalidation by room id.
  - Confirms global refresh invalidation path.
- `useRealtimeNotifications.test.tsx`
  - Confirms `game_room_updated` emits shared app event.
- `game-routes.test.ts`
  - Confirms supported game parsing/building behavior.
- `useGameRoomSession.test.tsx`
  - Covers join queueing, room-id swap reconnect, token-rotation reconnect, and no implicit leave on token rotate.
- `useManagedWebSocket.test.ts`
  - Covers reconnect delay schedule and lifecycle state transitions.

### Backend

- `game_handlers_realtime_test.go`
  - Verifies leave/cancel publishes to original participants.
  - Verifies already-closed room path does not publish.
- `game_hub_test.go`
  - Verifies disconnect does not execute old pending-cancel DB behavior.
  - Verifies multiple sockets per same user do not unregister active replacement.
- `game_hub_connect4_test.go`
  - Valid move, invalid move, turn enforcement, finish/winner/stats.
- `game_hub_othello_test.go`
  - Valid move, invalid move, pass-turn semantics, finish/winner/stats.

## Validation

- Commands run:
  - `make lint-frontend`
  - `cd frontend && bun run type-check`
  - `cd frontend && bun run vitest run src/components/games/GameCapsuleDock.test.tsx src/hooks/useRealtimeNotifications.test.tsx src/lib/game-routes.test.ts src/hooks/useManagedWebSocket.test.ts src/hooks/useGameRoomSession.test.tsx`
  - `cd backend && go test ./internal/server ./internal/notifications`
  - `make test-frontend`
  - `make test-backend`
- Test results:
  - Frontend lint passed.
  - Frontend type-check passed.
  - Focused frontend suites passed (`25/25`).
  - Focused backend touched packages passed.
  - Full frontend suite passed (`57 files`, `237 tests`).
  - Full backend suite passed (`go test -race ./...`).
- Manual verification:
  - Browser/manual dual-account verification not executed in this terminal session.

## How to Extend to a New Game

When adding a new multiplayer game, follow this pattern:

1. Add game type to route constants:
   - Update `SUPPORTED_GAME_TYPES` in `frontend/src/lib/game-routes.ts`.
2. Use shared presence hook in page component:
   - Call `useResumableGameRoomPresence(...)` with type/status/participant state.
3. Ensure page uses `useGameRoomSession`:
   - Provide `roomId`, `token`, room metadata, and `onAction`.
4. Ensure backend action flow updates room metadata:
   - `join_room`, `make_move`, and leave/cancel paths should trigger room update publish.
5. Add tests:
   - Route helper tests.
   - Presence/session hook tests if behavior diverges.
   - Backend move and fanout tests for that game type.

## Risks and Regressions

- Known risks:
  - UI animation tuning (shake cadence/color pulse) still needs subjective browser UX QA.
  - Local-storage presence can be stale across devices if one device terminates differently.
- Potential regressions:
  - Reconnect + invalidation bursts can create short spikes in room-detail requests.
  - Additional supported games require disciplined update of shared helpers to avoid route drift.
- Mitigations:
  - Targeted query invalidation by room id, plus global refresh only on websocket open.
  - Participant-scoped backend fanout limits event blast radius.
  - Shared helpers/hook reuse reduce copy-paste divergence.

## Follow-ups

- Remaining work:
  - Add optional debounce/coalescing for very rapid `game_room_updated` bursts.
  - Run browser E2E for two-account scenarios: navigate away, move alert, resume, explicit exit, token refresh.
  - Consider server-backed `my active matches` endpoint to complement local storage presence.
- Recommended next steps:
  - Manual QA matrix at viewport heights `680/720/768/900` for both games.
  - Add one Playwright flow specifically for dock attention behavior while off-route.

## Rollback Notes

- If a rollback is needed, revert in this order:
  1. `frontend/src/components/games/GameCapsuleDock.tsx`
  2. `frontend/src/lib/game-realtime-events.ts`
  3. `frontend/src/hooks/useRealtimeNotifications.ts`
  4. `frontend/src/lib/game-room-presence.ts`
  5. `frontend/src/hooks/useResumableGameRoomPresence.ts`
  6. `frontend/src/hooks/useGameRoomSession.ts`
  7. `frontend/src/hooks/useManagedWebSocket.ts`
  8. `frontend/src/pages/games/Othello.tsx`
  9. `frontend/src/pages/games/ConnectFour.tsx`
  10. `backend/internal/server/realtime_events.go`
  11. `backend/internal/server/game_handlers.go`
  12. `backend/internal/notifications/game_hub.go`
- Also revert corresponding test files to maintain green CI expectations.
