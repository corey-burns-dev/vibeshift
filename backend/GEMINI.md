# Vibeshift Backend Context

## Tech Stack

- **Language:** Go 1.25
- **Web Framework:** Fiber v2 (`github.com/gofiber/fiber/v2`)
- **Database:** PostgreSQL (Driver: `pgx`, ORM: `gorm`)
- **Cache:** Redis (`go-redis/v9`)
- **Auth:** JWT (`golang-jwt/jwt/v5`)
- **Config:** Viper
- **Documentation:** Swagger/OpenAPI (Files in `docs/`)
- **Testing:** Testify, Go standard testing

## Architecture

- **Structure:** Modular structure (likely Hexagonal/Clean Architecture).
  - `cmd/`: Entry points (e.g., seeding).
  - `config/`: Configuration loading (Viper).
  - `server/`: HTTP handlers and routing logic.
  - `middleware/`: Auth, rate limiting, etc.
  - `models/`: GORM struct definitions.
  - `repository/`: Data access layer.
  - `notifications/`: Real-time updates (WebSockets/Hub).
- **Entry Point:** `main.go` initializes config, database, and the Fiber server.

## Key Configuration

- **Port:** Defaults to 8375 (Configurable via `PORT` env or `config.yml`).
- **Database:** Configured via `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- **Redis:** Configured via `REDIS_URL`.

## Development

- **Run:** `go run main.go`
- **Hot Reload:** Uses `air` (Config: `.air.toml`).
- **Docker:** `Dockerfile.dev` for development container.

## API

n:\*\* `go run main.go`

- **Hot Reload:** Uses `air` (Config: `.air.toml`).
- **Docker:** `Dockerfile.dev` for development container.- Base Path: `/api`
- Health Checks: `/health` (and proxied from frontend).
- Documentation: `/swagger/*` (when enabled).
