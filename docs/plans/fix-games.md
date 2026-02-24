# Plan: Game Code Abstraction — Shared Hooks & Utilities

## Context

`ConnectFour.tsx` (932 lines) and `Othello.tsx` (947 lines) are ~95% structurally identical. With more games coming (Chess, Checkers, etc.), duplicated lifecycle code will multiply. This refactor extracts all shared behavior into hooks and components so future games only need to implement board rendering + move logic.

**Zero behavior changes.** This is a pure structural refactor.

---

## What's Already Abstracted (Keep As-Is)

- `useGameRoomSession.ts` — WebSocket lifecycle
- `useGameChat.ts` — Chat message management
- `GameChat.tsx` — Chat UI
- `useResumableGameRoomPresence.ts` — localStorage presence
- `game-realtime-events.ts`, `game-room-presence.ts`, `game-routes.ts`

## What's Duplicated (Needs Extraction)

**Identical utility code:** `playVictoryJingle()`, confetti piece generation algorithm, constants (`VICTORY_BLAST_DURATION_MS`, color arrays)

**Identical JSX blocks:** Victory/defeat overlay (~30 lines each), rematch dialog, leave game dialog

**Identical hook logic:** Room query + error redirect, realtime event listener, ref resets on roomId change, `handleRoomCancelled`, blast state + timers, end-game effect, timeout cleanup, chat scroll, `game_cancelled`/`chat`/`error` socket handlers, `handlePlayAgain`, `handleLeaveGame`, player role derivations, auto-join effect

**What stays game-specific:** Board state/type, board parsing from REST, `game_state`/`game_started` socket handlers, board rendering JSX, move sending + validation

---

## Files to Create

### 1. `frontend/src/lib/game-audio.ts`

```ts
export function playVictoryJingle(): void { /* Web Audio API 5-note melody */ }
```

Pure function, no React, no deps. Identical in both files today.

### 2. `frontend/src/lib/game-effects.ts`

```ts
export const VICTORY_BLAST_DURATION_MS = 4200
export const DEFAULT_CONFETTI_COLORS = [...]  // ConnectFour defaults
export const DEFAULT_DEFEAT_COLORS = [...]
export type ConfettiPiece = { id, left, delay, duration, rotate, color }
export function createConfettiPieces(colors: readonly string[]): ConfettiPiece[]
export function createDefeatPieces(colors: readonly string[]): ConfettiPiece[]
```

Pure data/functions. Each game passes its own color arrays (Othello uses green palette overrides).

### 3. `frontend/src/components/games/GameResultOverlay.tsx`

```tsx
interface Props {
  show: 'victory' | 'defeat' | null
  confettiColors?: readonly string[]   // defaults to DEFAULT_CONFETTI_COLORS
  defeatColors?: readonly string[]     // defaults to DEFAULT_DEFEAT_COLORS
}
export function GameResultOverlay({ show, ... }: Props)
```

Renders victory or defeat blast overlay. `show` is a discriminated union to prevent impossible state. Othello passes `confettiColors={OTHELLO_CONFETTI_COLORS}`.

### 4. `frontend/src/components/games/RematchDialog.tsx`

```tsx
interface Props {
  open: boolean; onOpenChange: (open: boolean) => void
  isWin: boolean; isDraw: boolean
  isStartingRematch: boolean
  onPlayAgain: () => void; onLobby: () => void
  accentColor?: 'blue' | 'emerald'
  showIcon?: boolean          // ConnectFour=true (has PartyPopper), Othello=false
  descriptions?: { win?: string; lose?: string; draw?: string }
}
```

Accent color drives border/bg/title classes via a lookup map.

### 5. `frontend/src/components/games/LeaveGameDialog.tsx`

```tsx
interface Props {
  open: boolean; onOpenChange: (open: boolean) => void
  isLeaving: boolean; onLeave: () => void
}
```

Simple confirmation dialog. Othello will not render it yet (leave was stubbed with `_` prefix — behavior preserved).

### 6. `frontend/src/hooks/useGameRoomCore.ts` — THE MAIN HOOK

**Options interface:**

```ts
export interface UseGameRoomCoreOptions {
  roomId: number | null
  roomIdParam: string | undefined   // raw useParams value — for query key cache consistency
  gameType: SupportedGameType       // 'connect4' | 'othello'
  gameLabel: string                 // 'Connect 4' — used in "Connect 4 Started!" toast
  opponentPlaceholder?: string      // 'BOT' (ConnectFour default) | 'Opponent' (Othello)
  onBoardAction: (
    type: 'game_state' | 'game_started',
    payload: Record<string, unknown>
  ) => void
}
```

**Returns:**

```ts
{
  room, coreState, setCoreState,         // coreState = { status, winner_id, next_turn, is_draw }
  isSocketReady, sendAction,
  currentUserId,                         // for makeMove validation
  isCreator, isOpponent, isPlayer, isMyTurn, canJoin, didIWin,
  playerOneName, playerTwoName, playerOneAvatar, playerTwoAvatar,
  messages, chatInput, setChatInput, sendChat, chatScrollRef,
  showVictoryBlast, showDefeatBlast,
  showRematchDialog, setShowRematchDialog, isStartingRematch,
  showLeaveDialog, setShowLeaveDialog, isLeavingGame,
  joinGame, handlePlayAgain, handleLeaveGame,
  movePendingRef, localLeaveRequestedRef,
}
```

**Internal flow (in order):**

1. Call `getCurrentUser()`, `useAuthToken()`, `useQueryClient()`, `useNavigate()`, `useAudio()` internally — callers don't pass these
2. Local state: `coreState`, `chatInput`, `showVictoryBlast`, `showDefeatBlast`, `showRematchDialog`, `isStartingRematch`, `showLeaveDialog`, `isLeavingGame`
3. Refs: `chatScrollRef`, `didShowEndGameUiRef`, `victoryTimeoutRef`, `defeatTimeoutRef`, `rematchDialogTimeoutRef`, `didShowGameStartedToastRef`, `movePendingRef`, `didHandleCancellationRef`, `localLeaveRequestedRef`, `onBoardActionRef`
4. `useQuery(['gameRoom', roomIdParam])` + `isError` → redirect effect
5. `useGameChat(roomId)` → `{ messages, addMessage }`
6. Ref reset effect on `roomId` change
7. `handleRoomCancelled` callback — updates `coreState`, removes presence, guards on `localLeaveRequestedRef.current` before toast+navigate
8. Seed `coreState` from REST room data (`useEffect([room])` — non-board fields only)
9. Realtime event listener effect (`GAME_ROOM_REALTIME_EVENT` → invalidate query)
10. Cancelled status watcher effect
11. `handleGameSocketAction` — handles `chat`/`game_cancelled`/`error` fully; for `game_state`/`game_started`: updates `coreState` from payload fields AND calls `onBoardActionRef.current(type, payload)` for board-specific updates
12. `useGameRoomSession({ ..., onAction: handleGameSocketAction })`
13. Player derivations: `isCreator`, `isOpponent`, `isPlayer`, `canJoin`, `isMyTurn`, `didIWin`
14. Player info: `playerOneName`, `playerTwoName`, `playerOneAvatar`, `playerTwoAvatar`
15. `useResumableGameRoomPresence(...)`
16. Auto-join effect (`canJoin` → `gameSession.joinRoom()`)
17. Chat scroll effect
18. `triggerVictoryBlast` / `triggerDefeatBlast` with `playVictoryJingle()` from `game-audio.ts`
19. End-game effect: watches `coreState.status === 'finished'` → blast → schedule rematch dialog
20. Timeout cleanup effect (unmount)
21. `sendChat`, `handlePlayAgain`, `handleLeaveGame`

**Critical implementation notes:**

- **`roomIdParam` vs `roomId`:** Query key must use string `roomIdParam` (from `useParams`) to match the cache key used by `GAME_ROOM_REALTIME_EVENT` invalidations — otherwise cache misses
- **`onBoardActionRef` pattern:** Wrap `onBoardAction` in a ref inside the hook so `handleGameSocketAction` stays stable without putting `onBoardAction` in its dependency array
- **`coreState` ownership:** The hook owns `status/winner_id/next_turn/is_draw`; game components own only board state. `game_state` socket handler updates both: hook updates `coreState`, then calls `onBoardAction` for the board
- **`localLeaveRequestedRef` guard:** Baked into `handleRoomCancelled` — Othello never sets it so its behavior is preserved (toast always fires)
- **Biome lint:** Keep `// biome-ignore lint/correctness/useExhaustiveDependencies` on the chat scroll effect

---

## Files to Modify

### 7. `frontend/src/pages/games/ConnectFour.tsx`

**Keeps:** `board: string[][]` state, `hoverColumn` state, `makeMove`, board seeding `useEffect([room])`, all board JSX, color constants passed to `GameResultOverlay`
**Removes:** Everything now in the hook (~600 lines → ~320 lines)
**Uses:** `useGameRoomCore(...)`, `<GameResultOverlay>`, `<RematchDialog accentColor='blue' showIcon>`, `<LeaveGameDialog>`

`onBoardAction` for ConnectFour:

```ts
onBoardAction: useCallback((type, payload) => {
  if (type === 'game_state') {
    setBoard(prev => {
      const newBoard = payload as unknown as { board: string[][] }
      if (prev && JSON.stringify(prev) !== JSON.stringify(newBoard.board)) playDropPieceSound()
      return Array.isArray(newBoard.board) ? newBoard.board : emptyBoard()
    })
  }
  // game_started: board stays as-is
}, [playDropPieceSound])
```

### 8. `frontend/src/pages/games/Othello.tsx`

**Keeps:** `board: Cell[][]` state, all Othello game utilities (`normalizeBoard`, `getValidMoves`, `countPieces`, etc.), `mySymbol`, `validMoves`, `makeMove`, board seeding `useEffect([room])`, all board JSX, piece counts, Othello-specific color constants
**Removes:** Everything now in the hook (~530 lines → ~400 lines)
**Uses:** `useGameRoomCore(...)`, `<GameResultOverlay confettiColors={...} defeatColors={...}>`, `<RematchDialog accentColor='emerald' showIcon={false}>`
**Does NOT render** `<LeaveGameDialog>` — leave was previously stubbed, behavior preserved

`onBoardAction` for Othello:

```ts
onBoardAction: useCallback((type, payload) => {
  if (type === 'game_state') {
    setBoard(prev => {
      const prevBoard = prev ?? createInitialBoard()
      const next = normalizeBoard(payload.board, prevBoard)
      if (prev && JSON.stringify(prev) !== JSON.stringify(next)) playDropPieceSound()
      return next
    })
  } else if (type === 'game_started') {
    setBoard(prev => {
      const existing = prev ?? createInitialBoard()
      return typeof payload.current_state === 'string'
        ? parseCurrentState(payload.current_state, existing) : existing
    })
  }
}, [playDropPieceSound])
```

---

## Implementation Order

1. `game-audio.ts` — pure function, zero risk
2. `game-effects.ts` — pure data, zero risk
3. `GameResultOverlay.tsx` — UI only, no logic
4. `RematchDialog.tsx` — UI only
5. `LeaveGameDialog.tsx` — UI only
6. `useGameRoomCore.ts` — highest coupling; write tests before touching game files
7. Refactor `ConnectFour.tsx` — canonical reference, verify manually
8. Refactor `Othello.tsx` — verify Othello-specific behaviors
9. Cleanup: remove `ActiveGameRoom` type duplication, unused constants

---

## Verification

- Run `bun run typecheck` — no new TS errors
- Run `bun run test` (unit tests) — existing game hook tests pass
- Manual dev smoke test:
  - ConnectFour: create room, join as opponent, make moves, chat, win/draw/lose overlays, rematch, leave game
  - Othello: same flow; verify green confetti, no leave button visible, 'Opponent' placeholder
- Confirm both games behave identically to before the refactor
