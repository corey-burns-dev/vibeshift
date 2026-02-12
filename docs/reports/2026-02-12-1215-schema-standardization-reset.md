# Schema Standardization Reset (2026-02-12)

## Summary

- Reset backend schema management to SQL-first default.
- Replaced legacy multi-step migration chain with a clean baseline migration.
- Kept explicit AutoMigrate command as manual tooling only.

## What Changed

- Deleted old migration files:
  - `backend/internal/database/migrations/000000_*` through `000006_*`
- Added new baseline migration pair:
  - `backend/internal/database/migrations/000001_baseline_schema.up.sql`
  - `backend/internal/database/migrations/000001_baseline_schema.down.sql`
- Updated schema defaults to SQL mode:
  - `backend/internal/config/config.go`
  - `backend/config.test.yml`
  - `backend/config.production.example.yml`
  - `config.example.yml`
  - `config.yml`
- Aligned model tags with standardized DB/index naming:
  - `backend/internal/models/sanctum.go`
  - `backend/internal/models/chat.go`
  - `backend/internal/models/friendship.go`
  - `backend/internal/models/sanctum_request.go`
- Updated docs:
  - `backend/MIGRATIONS.md`
  - `backend/TESTING.md`

## Validation Performed

- Reset schema and reapplied migrations (idempotent).
- `APP_ENV=test make db-migrate`
- `APP_ENV=test make db-schema-status`
- `cd backend && APP_ENV=test go test ./internal/repository -count=1 -v`
- `make test-backend`
- `make test-backend-integration`
- `APP_ENV=test make db-migrate-auto`

All commands passed in local verification.

## Team Rollout Notes

Anyone with an old local DB state should reset and re-run migrations.

Recommended sequence:

```bash
make test-up
APP_ENV=test make db-migrate
APP_ENV=test make db-schema-status
```

If stale state still exists, drop/recreate local schema or database and rerun the commands above.

## Risk Notes

- This is a dev/test oriented reset; old local migration history compatibility is intentionally not preserved.
- Production/staging should use SQL migrations (`DB_SCHEMA_MODE=sql`) and should not depend on runtime AutoMigrate.
