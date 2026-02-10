# Backend Testing

For repo-wide command and environment rules, see `/AI.md`.

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
go run ./cmd/migrate/main.go down
go run ./cmd/migrate/main.go version
```

Production runtime no longer relies on `AutoMigrate`; apply SQL migrations before starting the server in production.

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
