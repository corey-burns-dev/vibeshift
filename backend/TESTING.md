# Backend Testing

For repo-wide command and environment rules, see `/AGENTS.md`.

## Scope

This document covers backend test execution and test organization in `backend/`.

## Preferred Commands

From repo root:

```bash
make test
```

This is the default and most portable path for agent/local usage.

## Database Migrations

From `backend/`:

```bash
go run ./cmd/migrate/main.go up
go run ./cmd/migrate/main.go auto
go run ./cmd/migrate/main.go status
go run ./cmd/migrate/main.go down <version>
```

Default runtime mode is `DB_SCHEMA_MODE=sql`:
- SQL migrations always run.
- `AutoMigrate` is not run during normal test startup.
- Use `go run ./cmd/migrate/main.go auto` only when explicitly validating model/schema parity.

## Containerized Alternatives

Use when you need direct Go invocation inside containerized backend environment:

```bash
docker compose run --rm app go test -v ./...
docker compose run --rm app go test -cover ./...
```

## Focused Test Runs

From `backend/` (when Go toolchain is available in your environment):

```bash
go test ./internal/server/...
go test ./internal/repository/...
go test ./internal/notifications/...
```

If host Go is unavailable, run equivalent commands with `docker compose run --rm app ...`.

## Test Layout

- Unit and package tests live near implementation (`*_test.go`).
- Integration-style tests live under `backend/test/`.
- API utility scripts live in `backend/scripts/`.

## Coverage and Validation Notes

- Prefer targeted package tests while iterating.
- Run full backend test suite before merge.
- Keep tests behavior-focused and avoid changing runtime behavior during refactors.

## Sanctum Coverage

Sanctum-specific automated coverage now includes:

- Unit: `internal/validation/sanctum_test.go`
- HTTP integration: `test/sanctums_integration_test.go`
- Migration + seeding: `test/sanctum_migration_seed_test.go`

### Sanctum-Focused Commands

From `backend/`:

```bash
go test ./internal/validation -run Sanctum -count=1
go test ./test -run Sanctum -count=1
go test ./...
```

### Required Environment Variables

The integration and migration tests use PostgreSQL and expect these env vars
(defaults are applied if omitted):

- `DB_HOST` (default `localhost`)
- `DB_PORT` (default `5432`)
- `DB_USER` (default `sanctum_user`)
- `DB_PASSWORD` (default `sanctum_password`)
- `DB_NAME` (default `sanctum_test`)
- `APP_ENV=test` (recommended for config profile loading)

Redis is required for the server boot path in integration tests:

- `REDIS_URL` (default in test profile: `localhost:6379`)

## Load Smoke Coverage

Load-smoke coverage for critical paths is implemented with build-tagged tests:

- `test/load_smoke_test.go` covers login, feed read, and chat-send concurrency scenarios.

Run from `backend/`:

```bash
APP_ENV=test go test ./test -tags=load -run TestLoadScenarios -count=1
```

Or from repo root:

```bash
make test-load
```
