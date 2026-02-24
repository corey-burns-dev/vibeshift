# Task Report

## Metadata

- Date: `2026-02-24`
- Branch: `master`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Persist game-room chat history and abstract reusable game chat UI/hook for ConnectFour and Othello`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["backend", "frontend", "websocket", "db"],
  "Lessons": [
    {
      "title": "WebSocket-only chat loses messages across page unmounts",
      "severity": "HIGH",
      "anti_pattern": "Keeping game chat history only in component state while relying on realtime pushes",
      "detection": "rg -n \"case 'chat'|setMessages\\(|useState<ChatMessage\" frontend/src/pages/games",
      "prevention": "Persist game-room messages server-side and hydrate on mount via API before appending websocket events"
    }
  ]
}
```

## Summary

- What was requested:
  - Fix ConnectFour/Othello chat so messages are retained when a player navigates away and later returns.
  - Abstract chat implementation for reuse in future games.
- What was delivered:
  - Added persisted `game_room_messages` backend storage and retrieval endpoint.
  - Added reusable `GameChat` component and `useGameChat` hook.
  - Migrated ConnectFour and Othello to shared chat plumbing.

## Changes Made

- Backend:
  - Added `GameRoomMessage` model and max-history cap constant.
  - Added migration `000011_game_room_messages` (`up`/`down`).
  - Registered model in persistent model registry.
  - Persisted chat messages in `GameHub.handleChat` and bounded history per room.
  - Corrected chat-history trimming logic to delete only excess oldest rows (not all rows at limit boundary).
  - Added authenticated endpoint `GET /games/rooms/:id/messages`.
- Frontend:
  - Added API type `GameRoomChatMessage` and client method `getGameRoomMessages`.
  - Added reusable [GameChat.tsx](/home/cburns/apps/sanctum/frontend/src/components/games/GameChat.tsx).
  - Added reusable [useGameChat.ts](/home/cburns/apps/sanctum/frontend/src/hooks/useGameChat.ts).
  - Updated [ConnectFour.tsx](/home/cburns/apps/sanctum/frontend/src/pages/games/ConnectFour.tsx) and [Othello.tsx](/home/cburns/apps/sanctum/frontend/src/pages/games/Othello.tsx) to use shared hook/component.
  - Resolved frontend lint debt on touched surfaces (import ordering/formatting, dead-symbol cleanup) and documented intentional drag-wrapper accessibility exception in [ChatDock.tsx](/home/cburns/apps/sanctum/frontend/src/components/chat/ChatDock.tsx).
  - Updated [App.feed-routes.test.tsx](/home/cburns/apps/sanctum/frontend/src/App.feed-routes.test.tsx) mock to include `useSignup` after `App` route logic began using that hook.
  - Added test coverage for the new reusable chat abstraction and API endpoint client wiring.

- Tests added:
  - [game_hub_chat_test.go](/home/cburns/apps/sanctum/backend/internal/notifications/game_hub_chat_test.go)
  - [game_handlers_messages_test.go](/home/cburns/apps/sanctum/backend/internal/server/game_handlers_messages_test.go)
  - [models_registry_test.go](/home/cburns/apps/sanctum/backend/internal/database/models_registry_test.go)
  - [useGameChat.test.tsx](/home/cburns/apps/sanctum/frontend/src/hooks/useGameChat.test.tsx)
  - [GameChat.test.tsx](/home/cburns/apps/sanctum/frontend/src/components/games/GameChat.test.tsx)
  - API client test extension in [client.test.ts](/home/cburns/apps/sanctum/frontend/src/api/client.test.ts)

## Validation

- Commands run:
  - `cd backend && go test ./internal/notifications ./internal/server ./internal/database`
  - `cd frontend && bun run vitest src/components/games/GameChat.test.tsx src/hooks/useGameChat.test.tsx src/api/client.test.ts --run`
  - `cd frontend && bun run type-check`
  - `cd frontend && bun --bun biome check src/components/games/GameChat.tsx src/hooks/useGameChat.ts src/pages/games/ConnectFour.tsx src/pages/games/Othello.tsx`
  - `make lint-frontend`
  - `make test-backend`
  - `make test-frontend`
- Test results:
  - Frontend type-check passes.
  - Frontend lint passes.
  - Backend test suite passes.
  - Frontend test suite passes.
- Manual verification:
  - Not run in browser in this session.

## Risks and Regressions

- Known risks:
  - Message deduping in history merge uses `(user_id,text)` and may collapse repeated identical lines from same user if they race between history fetch and WS append.
- Potential regressions:
  - History trimming now relies on counting + deleting oldest IDs; behavior should be monitored under very high throughput.
- Mitigations:
  - Kept bounded message cap.
  - Preserved existing websocket action payloads and UI interaction model.

## Follow-ups

- Remaining work:
  - Add browser-level E2E coverage for away/return capsule flows across two live users.
- Recommended next steps:
  - Browser QA with two users across navigation transitions (in-game <-> capsule) for both games.

## Rollback Notes

- Revert migration and backend model/handler/hub changes as one unit.
- Revert frontend `GameChat`/`useGameChat` integration and restore per-page inline chat if needed.
- If rolling back schema, apply migration down for `000011_game_room_messages` after ensuring no dependent code remains deployed.
