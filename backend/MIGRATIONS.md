# Controlled Database Migrations

This project uses a custom SQL-based migration system instead of GORM AutoMigrate.

## Writing Migrations

Create migration files in `backend/internal/server/migrations/` with the naming convention:
```
YYYYMMDDHHMMSS_description.up.sql   # Migration to apply
YYYYMMDDHHMMSS_description.down.sql # Rollback script
```

Example:
```
20240215120000_create_sessions.up.sql
20240215120000_create_sessions.down.sql
```

## Applying Migrations

Migrations run automatically on startup via `database.Connect()`. The system tracks applied migrations in the `migration_logs` table (automatically created by migration 000001).

## Manual Operations

```bash
# Run migrations (happens automatically on startup)
cd backend && go run cmd/server/main.go
```

Rollback is available via `RollbackMigration(ctx, db, version)` in `internal/database/migrate_runner.go`.

## Configuration

Read replica support (optional):
```yaml
DB_READ_HOST: "read-replica-host"
DB_READ_PORT: "5432"
DB_READ_USER: "readonly_user"
DB_READ_PASSWORD: "secret"
```

## Best Practices

1. Always write both up and down scripts
2. Down scripts should be idempotent
3. Test rollbacks before deploying
4. Back up data before applying migrations in production
