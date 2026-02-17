# Hierarchical Moderation: Usage Guide

This guide explains how to operate the new moderation model in day-to-day dev
and test workflows.

For code-level implementation details, see:
`docs/features/hierarchical-moderation-implementation.md`.

## Quick Start

1. Ensure DB migrations are applied:

```bash
make db-migrate
```

1. Start the app:

```bash
make dev
```

1. Sign in as a master admin (development root defaults below).

## Roles and What They Can Do

## Master Admin (global)

Backed by `users.is_admin`.

Can:

1. Access global admin pages/routes.
2. Manage sanctum admins.
3. Manage chat moderators.
4. Moderate any room.

## Sanctum Admin (sanctum-scoped)

Backed by sanctum membership role:

1. `owner`
2. `mod` (shown as "Sanctum Admin")

Can:

1. Moderate chat in their sanctum room.
2. Manage chat moderators for their sanctum room.
3. If `owner`, promote/demote sanctum admins in that sanctum.

## Chat Moderator (room-scoped)

Backed by `chatroom_moderators`.

Can:

1. Moderate chat participants in assigned room only.

Cannot:

1. Manage sanctum admins.
2. Perform global admin operations.

## Development Root Admin

In `APP_ENV=development`, bootstrap ensures `user_id=1` root admin.

Defaults:

1. Username: `sanctum_root`
2. Email: `root@sanctum.local`
3. Password: `DevRoot123!`

Config values:

1. `DEV_BOOTSTRAP_ROOT=true`
2. `DEV_ROOT_USERNAME=sanctum_root`
3. `DEV_ROOT_EMAIL=root@sanctum.local`
4. `DEV_ROOT_PASSWORD=DevRoot123!`
5. `DEV_ROOT_FORCE_CREDENTIALS=true`

Safety:

1. In development, demotion of `user_id=1` is blocked by API/CLI guards.

## Common Workflows

## A) Promote a sanctum admin

Endpoint:

`POST /api/sanctums/:slug/admins/:userId`

Who can do it:

1. Master admin
2. Sanctum owner

Example:

```bash
curl -X POST "http://localhost:8375/api/sanctums/development/admins/42" \
  -H "Authorization: Bearer <token>"
```

## B) Demote a sanctum admin

Endpoint:

`DELETE /api/sanctums/:slug/admins/:userId`

Rules:

1. Owner/master only.
2. Cannot demote sanctum owner with this endpoint.

## C) List sanctum admins

Endpoint:

`GET /api/sanctums/:slug/admins`

Returns `owner` and `mod` memberships for that sanctum.

## D) Add a chat moderator

Endpoint:

`POST /api/chatrooms/:id/moderators/:userId`

Who can do it:

1. Master admin
2. Sanctum owner/mod for linked sanctum room

## E) Remove a chat moderator

Endpoint:

`DELETE /api/chatrooms/:id/moderators/:userId`

Same authorization as add.

## F) List chat moderators

Endpoint:

`GET /api/chatrooms/:id/moderators`

## G) Moderate chat participants

Participant removal endpoint:

`DELETE /api/chatrooms/:id/participants/:participantId`

Allowed for:

1. Master admin
2. Sanctum owner/mod for linked sanctum room
3. Explicit chat moderator for that room
4. Non-sanctum legacy room creator fallback

## Frontend Behavior

1. Existing master admin pages still rely on `is_admin`.
2. Sanctum detail page includes a Sanctum Admin management section for
   authorized users.
3. Chat views include capability signals from backend:
   - `capabilities.can_moderate`
   - `capabilities.can_manage_moderators`
4. Group conversation headers show a `Moderator` indicator when applicable.

## Capability Fields

Chatroom responses may include:

```json
{
  "id": 123,
  "is_group": true,
  "capabilities": {
    "can_moderate": true,
    "can_manage_moderators": false
  }
}
```

Use these flags in UI and client logic instead of inferring permissions purely
from role names.

## Troubleshooting

## 403 on sanctum admin routes

Check:

1. Token belongs to master admin or sanctum owner.
2. Sanctum slug exists.

## 403 on chat moderator routes

Check:

1. Room exists and is linked to sanctum.
2. Caller is master admin or sanctum owner/mod for that room's sanctum.

## Cannot demote ID 1 in development

Expected behavior. `user_id=1` is protected in development to prevent lockout.

## Migration issues for `chatroom_moderators`

Verify migration 000005 is applied:

```bash
make db-schema-status
```

Then re-run:

```bash
make db-migrate
```
