# Sanctum Test Matrix

## Backend

- Slug validation (`valid/invalid/reserved/length/hyphen edges`)
  - `backend/internal/validation/sanctum_test.go`
- `GET /api/sanctums` seeded + stable across re-seed
  - `backend/test/sanctums_integration_test.go::TestGetSanctumsStableAfterReseed`
- `POST /api/sanctums/requests` auth/pending/duplicate-409
  - `backend/test/sanctums_integration_test.go::TestCreateSanctumRequest`
- `GET /api/sanctums/requests/me` auth + current-user-only
  - `backend/test/sanctums_integration_test.go::TestGetMySanctumRequests`
- Admin authz (`401` no auth, `403` non-admin, success admin)
  - `backend/test/sanctums_integration_test.go::TestAdminEndpointsRequireAdmin`
- Approve side effects (sanctum + owner membership + default chat)
  - `backend/test/sanctums_integration_test.go::TestApproveCreatesSanctumMembershipChatroom`
- Reject persists status + `review_notes`
  - `backend/test/sanctums_integration_test.go::TestRejectPersistsReviewNotes`
- Migrations apply on fresh ephemeral PostgreSQL DB
  - `backend/test/sanctum_migration_seed_test.go::TestMigrationsApplyFreshDB`
- Seeding idempotence for built-in sanctums/chatrooms
  - `backend/test/sanctum_migration_seed_test.go::TestSanctumSeedIdempotent`

## Frontend (Vitest + RTL)

### Lib

- Left-nav ordering/exclusion logic
  - `frontend/src/lib/sanctums.test.ts`
- Utils
  - `frontend/src/lib/utils.test.ts`

### Hooks

- Auth: signup, login, logout, getAuthToken
  - `frontend/src/hooks/useAuth.test.tsx`
- Chat: conversations, messages, chatrooms, mutations
  - `frontend/src/hooks/useChat.test.tsx`
- Sanctums: list, detail, requests, admin, mutations
  - `frontend/src/hooks/useSanctums.test.tsx`
- Friends: list, requests, status, mutations
  - `frontend/src/hooks/useFriends.test.tsx`
- Presence store
  - `frontend/src/hooks/usePresence.test.ts`
- Media query / isMobile
  - `frontend/src/hooks/useMediaQuery.test.ts`
- Posts, Users, Streams, Comments
  - `frontend/src/hooks/usePosts.test.tsx`, `useUsers.test.tsx`, `useStreams.test.tsx`, `useComments.test.tsx`

### Providers

- ChatProvider WebSocket dedupe and reconnect
  - `frontend/src/providers/ChatProvider.spec.tsx`
- ChatProvider integration (subscription/message flow)
  - `frontend/src/providers/ChatProvider.integration.test.tsx`

### Components

- MessageList, MessageItem, ChatDockConversationList, ParticipantsList
  - `frontend/src/components/chat/*.test.tsx`
- FriendList, FriendCard, FriendRequests
  - `frontend/src/components/friends/*.test.tsx`
- ProtectedRoute, ErrorBoundary
  - `frontend/src/components/ProtectedRoute.test.tsx`, `ErrorBoundary.test.tsx`

### Pages

- Request form, My Requests, Routes, Onboarding
  - `frontend/src/pages/SanctumRequestForm.test.tsx`, `MySanctumRequests.test.tsx`, `SanctumRoutes.test.tsx`, `OnboardingSanctums.test.tsx`
- Login, Signup
  - `frontend/src/pages/Login.test.tsx`, `Signup.test.tsx`
- Sanctums list, AdminSanctumRequests
  - `frontend/src/pages/Sanctums.test.tsx`, `AdminSanctumRequests.test.tsx`

## E2E (Playwright)

- User submits Sanctum request and sees it in My Requests
- `frontend/test/tests/e2e/sanctum-user-request.spec.ts` (`@smoke`)
- Admin approves request and sanctum appears in list/detail
- `frontend/test/tests/e2e/sanctum-admin-approve.spec.ts` (`@smoke`)
- Open Chat button navigates using `default_chat_room_id`
- `frontend/test/tests/e2e/sanctum-open-chat.spec.ts`
- Non-admin access control for admin page/approve endpoint
- `frontend/test/tests/e2e/sanctum-access-control.spec.ts`
- Auth flows (signup, login)
- `frontend/test/tests/e2e/auth-flows.spec.ts`
- Friends page
- `frontend/test/tests/e2e/friends-workflow.spec.ts`
- Navigation (sanctums, posts)
- `frontend/test/tests/e2e/navigation.spec.ts`
