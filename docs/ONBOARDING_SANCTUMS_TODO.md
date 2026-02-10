# TODO: Signup Onboarding for Sanctums

Status: **Not implemented intentionally**.

Reason: the current API does not expose a user-facing Sanctum follow/join
mechanism that can persist onboarding selections.

Current Sanctum API supports:

- `GET /api/sanctums`
- `GET /api/sanctums/{slug}`
- `POST /api/sanctums/requests`
- `GET /api/sanctums/requests/me`
- Admin moderation routes for requests

## Minimal backend API needed

To support `/onboarding/sanctums` after signup with forced Atrium + min 3 picks,
add the following protected endpoints:

1. `POST /api/sanctums/memberships/bulk`
- Auth required.
- Request body:
  - `{ "sanctum_ids": number[] }` (or slugs)
- Behavior:
  - idempotent upsert into `sanctum_memberships` with role `member`
  - enforces active sanctums only
  - enforces max size (e.g. 20)
- Response:
  - `{ "joined": number, "sanctum_ids": number[] }`

2. `GET /api/sanctums/memberships/me`
- Auth required.
- Returns followed/joined sanctums for current user.

Optional convenience endpoint:

3. `POST /api/sanctums/{id}/join`
- Single join action, idempotent.

## Frontend behavior once API exists

- Add route `/onboarding/sanctums` after signup.
- Require at least 3 selections.
- Force include `atrium`.
- Preselect `development` (Forge) and `gaming` (Game Room).
- Submit via `POST /api/sanctums/memberships/bulk`.
- Redirect to `/` (or `/posts`) on success.

## Current code TODO marker

- `frontend/src/hooks/useAuth.ts` includes a TODO at signup success redirect.
