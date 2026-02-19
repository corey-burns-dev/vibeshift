# Home Feed and Chat Moderation Overhaul Report

## Metadata

- Date: `2026-02-19`
- Branch: `current workspace`
- Author/Agent: `Codex (GPT-5)`
- Scope: `frontend + backend`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "backend", "websocket", "db"],
  "Lessons": [
    {
      "title": "Avoid provider-coupled hooks in shared UI surfaces",
      "severity": "MEDIUM",
      "anti_pattern": "Using ChatProvider-only context in generic menus/pages causes non-chat tests and surfaces to break",
      "detection": "rg -n \"useChatContext\\(\" frontend/src",
      "prevention": "Prefer global stores for lightweight presence checks in shared hooks; reserve provider hooks for chat-specific flows"
    }
  ]
}
```

## Summary

- Requested: implement feed/layout/navigation, sanctum-scoped posting/feed behavior, and chat moderation expansion including room bans and role wiring.
- Delivered: backend room-ban model/routes/enforcement and sanctum owner/admin room-moderator sync; frontend `/submit` flow with sanctum targeting, `/feed` parity with `/`, sanctum mobile drawer, desktop 3-column feed adjustments, post online indicators, connect4 offline gating, and chat right-click moderation actions in message + participant surfaces.

## Changes Made

- Backend:
  - Added room ban model and migration: `backend/internal/models/chatroom_ban.go`, `backend/internal/database/migrations/000010_chatroom_bans.up.sql`, `backend/internal/database/migrations/000010_chatroom_bans.down.sql`.
  - Added room ban handlers and routes: `backend/internal/server/chat_ban_handlers.go`, `backend/internal/server/server.go`.
  - Enforced room bans for join/send: `backend/internal/service/chat_service.go`.
  - Registered sanctum creator as default room moderator on approval: `backend/internal/server/sanctum_handlers.go`.
  - Synced sanctum admin promote/demote with room moderator records: `backend/internal/server/sanctum_admin_handlers.go`.
  - Added model registry entry: `backend/internal/database/models_registry.go`.
- Frontend:
  - Added `sanctum_id` to post create payload type: `frontend/src/api/types.ts`.
  - Added chatroom participant removal + room ban API methods: `frontend/src/api/client.ts`.
  - Added room moderation hooks (kick/mute/ban/mod management): `frontend/src/hooks/useChat.ts`.
  - Added dedicated create post page and route: `frontend/src/pages/CreatePost.tsx`, `frontend/src/App.tsx`.
  - Added navbar/mobile create-post affordances: `frontend/src/components/TopBar.tsx`, `frontend/src/components/MobileHeader.tsx`, `frontend/src/components/navigation.ts`.
  - Updated posts page layout + mobile sanctum drawer + sanctum-targeted creation + online indicators: `frontend/src/pages/Posts.tsx`.
  - Changed `/feed` to same behavior as `/`: `frontend/src/App.tsx`.
  - Updated sanctum detail to show sanctum-only posts list: `frontend/src/pages/SanctumDetail.tsx`.
  - Disabled connect4 invite when target offline: `frontend/src/hooks/useUserActions.ts`, `frontend/src/components/UserMenu.tsx`, `frontend/src/components/UserContextMenu.tsx`.
  - Added moderation actions into user menus and wired to message/participants list: `frontend/src/components/UserContextMenu.tsx`, `frontend/src/components/UserMenu.tsx`, `frontend/src/components/chat/MessageItem.tsx`, `frontend/src/components/chat/MessageList.tsx`, `frontend/src/components/chat/ParticipantsList.tsx`, `frontend/src/pages/Chat.tsx`.
  - Updated onboarding selection behavior and tests: `frontend/src/pages/OnboardingSanctums.tsx`, `frontend/src/pages/OnboardingSanctums.test.tsx`.
  - Updated post media test mocks for new hooks: `frontend/src/pages/Posts.media-upload.test.tsx`.

## Validation

- Commands run:
  - `cd frontend && bun run type-check` (pass)
  - `make test-frontend` (1 existing failure remains; details below)
  - `cd frontend && bun run test:run src/pages/OnboardingSanctums.test.tsx src/pages/Posts.media-upload.test.tsx src/pages/SanctumRoutes.test.tsx src/components/chat/ParticipantsList.test.tsx` (pass)
  - `cd backend && GOCACHE=/tmp/go-build GOMODCACHE=/tmp/go-mod go test ./...` (blocked by network-restricted module downloads in sandbox)
- Test results:
  - Frontend suite: `200 passed / 1 failed` (`src/components/chat/ChatDock.test.tsx`, pre-existing workspace issue).
  - Backend tests: not executable in this environment due restricted network/module fetch.
- Manual verification:
  - Implemented in code paths for feed layout, mobile sanctum drawer, create post target selection, sanctum-scoped listing, online status gating, and chat moderation actions.

## Risks and Regressions

- Known risks:
  - `SanctumDetail` post list currently uses direct API load (non-query hook) to avoid route-test provider constraints; may diverge from list caching patterns.
  - Chat moderation flows rely on prompt-based timeout/ban reason UX; functional but minimal.
- Potential regressions:
  - Chat moderation actions depend on capability payload availability from current conversation objects.
  - Existing failing `ChatDock` unit test remains in workspace.
- Mitigations:
  - Type-check passes.
  - Targeted tests for modified onboarding/posts/sanctum routes/participants pass.

## Follow-ups

- Remaining work:
  - Add backend tests for room ban CRUD/enforcement and sanctum mod synchronization.
  - Add dedicated frontend tests for moderation action visibility + action dispatch.
  - Migrate `SanctumDetail` post loading to shared query hook with proper provider test harness updates.
- Recommended next steps:
  - Resolve existing `ChatDock` test failure in `frontend/src/components/chat/ChatDock.test.tsx`.
  - Run backend tests in a network-enabled/containerized environment per repo Make targets.

## Rollback Notes

- Revert safely by rolling back:
  - Migration `000010_chatroom_bans` (down migration provided).
  - Backend route/handler/service/model changes listed above.
  - Frontend route/menu/hook updates for create post and moderation actions.
