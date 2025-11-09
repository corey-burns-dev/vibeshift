# Vibeshift

A Go-based full-stack application with Redis and PostgreSQL, containerized for easy development and deployment.

## Features

- REST API with health and ping endpoints
- Docker containerization for dev and prod
- Hot reloading in development
- PostgreSQL and Redis integration

## Prerequisites

- Docker and Docker Compose
- Git

## Quick Start

1. **Clone the repository:**

   ```bash
   git clone https://github.com/corey-burns-dev/vibeshift.git
   cd vibeshift
   ```

2. **Set up environment variables:**

   ```bash
   make env
   ```

   This copies `.env.example` to `.env`. Edit `.env` with your settings if needed.

3. **Run in Development (with hot reloading):**

   ```bash
   make dev
   ```

   - The app will be available at `http://localhost:8080`
   - Edit Go files and see changes reload automatically

4. **Run in Production:**

   ```bash
   make prod
   ```

   - Optimized for production with minimal image size

## Common Commands

Use `make help` to see all available commands:

```bash
make dev        # Start development with hot reloading
make prod       # Start production environment
make down       # Stop all containers
make clean      # Clean containers, volumes, and build artifacts
make logs       # View live container logs
make fmt        # Format Go code
make lint       # Run Go linter
```

## API Endpoints

- `GET /health` - Health check: `{"status": "ok", "service": "ai-chat"}`
- `GET /ping` - Ping: `{"message": "pong"}`

## Environment Variables

- `POSTGRES_PASSWORD` - Password for PostgreSQL database
- `REDIS_URL` - Redis connection URL (default: `redis://redis:6379`)
- `DATABASE_URL` - PostgreSQL connection URL

`REDIS_URL` accepts either a plain `host:port` value or a URL form. Examples:

```bash
# URL form (supports password and DB index)
export REDIS_URL="redis://:mypassword@redis:6379/1"

# TLS (secure) URL form
export REDIS_URL="rediss://:mypassword@redis:6379/1"

# Plain host:port form (no scheme)
export REDIS_URL="redis:6379"
Note: when `REDIS_URL` uses the `rediss://` scheme the client will enable TLS when connecting. Ensure your Redis instance is configured for TLS when using `rediss://`.
```

The server will parse a `redis://` or `rediss://` URL and extract host, port, password, and an optional DB index. `rediss://` is the same URL form but indicates a TLS (secure) connection. If a plain `host:port` is provided (for example `redis:6379`) it will be used directly.

Examples:

```bash
# Unsecured Redis (default)
export REDIS_URL="redis://:mypassword@redis:6379/1"

# Secured (TLS) Redis
export REDIS_URL="rediss://:mypassword@redis:6379/1"

# Plain host:port
export REDIS_URL="redis:6379"
```

## Development

### Project Structure

```text
vibeshift/
├── main.go                 # Main application
├── Dockerfile              # Production build
├── Dockerfile.dev          # Development build
├── compose.yml             # Production & base services
├── docker-compose.override.yml  # Development overrides
├── .air.toml               # Air config for hot reloading
├── Makefile                # Build and development commands
├── go.mod                  # Go modules
├── .env                    # Environment variables (local)
└── .env.example            # Example env file (template)
```

### Adding New Features

1. Edit `main.go` or add new files
2. The dev environment will auto-reload
3. Test with `curl` or your preferred tool

## Deployment

For production deployment:

1. Ensure `.env` has production values (use a secure password)
2. Build and run:

   ```bash
   make prod
   ```

3. View logs:

   ```bash
   make logs
   ```

4. Stop:

   ```bash
   make down
   ```

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make changes
4. Test with dev environment
5. Submit a PR

## License

MIT

## CI / Integration Tests

- The repository's integration workflow uses Docker Compose. On GitHub Actions runners the workflow will install the Docker Compose CLI plugin and provide a `docker-compose` compatibility symlink so tests run regardless of the runner's preinstalled compose tooling.
- If you run the integration script locally, ensure you have a Compose-capable Docker CLI (`docker compose`) or the legacy `docker-compose` binary available.
