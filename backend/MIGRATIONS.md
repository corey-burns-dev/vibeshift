# Database Schema and Migrations

Schema control is centralized in `internal/database` and driven by `DB_SCHEMA_MODE`.

For a quick operational guide (commands, workflow, reset steps), see:
`docs/development/migrations.md`.

## Modes

- `sql` (default): run SQL migrations only.
- `hybrid`: run SQL migrations, then run `AutoMigrate` only in non-production environments.
- `auto`: run `AutoMigrate` only. In `production`/`staging`, this requires `DB_AUTOMIGRATE_ALLOW_DESTRUCTIVE=true`.

## Migration Files

Store SQL migrations in:

- `backend/internal/database/migrations/*.up.sql`
- `backend/internal/database/migrations/*.down.sql`

Naming format:

```text
000007_add_example_table.up.sql
000007_add_example_table.down.sql
```

## Commands

From `backend/`:

```bash
go run ./cmd/migrate/main.go up
go run ./cmd/migrate/main.go auto
go run ./cmd/migrate/main.go status
go run ./cmd/migrate/main.go down <version>
```

From repo root:

```bash
make db-migrate
make db-migrate-auto
make db-schema-status
```

## Runtime Behavior

- Server startup calls `database.Connect()`, which applies schema according to `DB_SCHEMA_MODE`.
- Recommended for development and test: `DB_SCHEMA_MODE=sql`.
- Use `DB_SCHEMA_MODE=auto` only for explicit/manual schema reconciliation.
- SQL migrations are tracked in `migration_logs`.
- Rollbacks execute the corresponding `*.down.sql` and remove the migration log row.
