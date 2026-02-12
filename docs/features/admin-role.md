# Admin Role Guide

This project supports an admin role (`users.is_admin`) for privileged moderation
and operational actions.

## What admins can do

- Review Sanctum requests at `/admin/sanctum-requests`
- Approve/reject Sanctum creation requests
- Promote/demote users via admin tooling/API

## Sanctum moderation UI

Admin page:

- Route: `/admin/sanctum-requests`
- Component: `frontend/src/pages/AdminSanctumRequests.tsx`

Behavior:

- Non-admin users are redirected to `/sanctums`
- Admin users can:
  - filter by `pending`, `approved`, `rejected`
  - approve with optional review notes
  - reject with optional review notes

## Local admin setup (single admin recommended)

### 1) Create your account

Sign up in the app first so your user row exists.

### 2) Make yourself the only admin

```bash
make admin-bootstrap-me email=<your_email>
```

This command:

- demotes all current admins
- promotes exactly the account with the provided email
- prints resulting admin users

If you are logged in already, log out and back in so `is_admin` refreshes in the
frontend session.

## Admin management commands

- List admins:

```bash
make admin-list
```

- Promote by user id:

```bash
make admin-promote user_id=<id>
```

- Demote by user id:

```bash
make admin-demote user_id=<id>
```

- Bootstrap one-admin mode by email:

```bash
make admin-bootstrap-me email=<email>
```

## Notes

- `make admin-bootstrap-me` uses your local DB env values from `.env` when
  available (`POSTGRES_*`) and falls back to `DB_*` or safe defaults.
- In this repo’s default local setup, DB defaults are:
  - host: `localhost`
  - port: `5432`
  - user: `sanctum_user`
  - database: `sanctum`
