# Sanctum Signup Onboarding

Status: **Implemented**.

## Behavior

After successful signup, users are redirected to:

- `/onboarding/sanctums`

On this page:

- Atrium (`atrium`) is required and cannot be deselected.
- Forge (`development`) and Game Room (`gaming`) are preselected.
- User must keep at least 3 sanctums selected.
- Submit saves selections and redirects to `/posts`.

## Backend API contract

Protected endpoints:

1. `GET /api/sanctums/memberships/me`
- Returns the current user's sanctum memberships with sanctum metadata.

2. `POST /api/sanctums/memberships/bulk`
- Request body:
  - `{ "sanctum_slugs": string[] }`
- Behavior:
  - validates all slugs are active sanctums
  - upserts membership rows for selected sanctums
  - removes unselected rows for role `member` (keeps owner/mod rows)
- Response:
  - array of membership rows with nested sanctum details

## Notes

- Onboarding constraints (Atrium required + minimum 3) are enforced in frontend UX.
- Backend bulk endpoint is generic and can be reused for profile preference updates.
