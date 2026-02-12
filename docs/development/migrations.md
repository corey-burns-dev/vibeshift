# Database Migrations Mini Guide

This app uses SQL migrations as the primary schema authority.

## Current Standard

- Default runtime schema mode: `DB_SCHEMA_MODE=sql`
- Runtime startup applies SQL migrations only
- `AutoMigrate` is available only as an explicit/manual command
- Migration files live in `backend/internal/database/migrations/`

## Migration Tools

- CLI: `backend/cmd/migrate/main.go`
- Make targets (from repo root):
  - `make db-migrate`
  - `make db-migrate-auto`
  - `make db-schema-status`

## Common Commands

From repo root:

```bash
# Apply SQL migrations
make db-migrate

# View applied/pending migrations
make db-schema-status

# Run explicit AutoMigrate (manual use only)
make db-migrate-auto
```

From `backend/` directly:

```bash
go run ./cmd/migrate/main.go up
go run ./cmd/migrate/main.go status
go run ./cmd/migrate/main.go auto
go run ./cmd/migrate/main.go down <version>
```

## Typical Workflow (Schema Change)

1. Edit or add migration SQL files in `backend/internal/database/migrations/`.
2. Apply migrations locally: `make db-migrate`.
3. Check status: `make db-schema-status`.
4. Run backend tests: `make test-backend`.
5. If needed, run integration tests: `make test-backend-integration`.

## Dev/Test Reset Workflow

Use this when you want a clean local DB state.

```bash
# Start test services
make test-up

# Apply current SQL schema baseline
APP_ENV=test make db-migrate

# Confirm no pending migrations
APP_ENV=test make db-schema-status
```

If your local DB has stale state from older migration chains, drop and recreate schema/database first, then re-run `make db-migrate`.

## Notes and Guardrails

- Keep migration names monotonic and descriptive (e.g. `000002_add_x.up.sql`).
- Treat SQL migrations as source of truth for runtime behavior.
- Do not rely on runtime `AutoMigrate` for normal development/test startup.
- Use `db-migrate-auto` only for explicit reconciliation/debug tasks.
