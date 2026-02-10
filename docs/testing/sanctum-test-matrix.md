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

- Left-nav ordering/exclusion logic
  - `frontend/src/lib/sanctums.test.ts`
- Request form required fields + submit payload + success/error states
  - `frontend/src/pages/SanctumRequestForm.test.tsx`
- My Requests statuses + empty state rendering
  - `frontend/src/pages/MySanctumRequests.test.tsx`
- Minimal route loading (`/sanctums`, `/s/:slug`)
  - `frontend/src/pages/SanctumRoutes.test.tsx`

## E2E (Playwright)

- User submits Sanctum request and sees it in My Requests
  - `frontend/tests/e2e/sanctum-user-request.spec.ts` (`@smoke`)
- Admin approves request and sanctum appears in list/detail
  - `frontend/tests/e2e/sanctum-admin-approve.spec.ts` (`@smoke`)
- Open Chat button navigates using `default_chat_room_id`
  - `frontend/tests/e2e/sanctum-open-chat.spec.ts`
- Non-admin access control for admin page/approve endpoint
  - `frontend/tests/e2e/sanctum-access-control.spec.ts`
