# Vibeshift

A professional full-stack application with Go backend, React frontend, Redis, and PostgreSQL. All orchestrated through Docker Compose and a comprehensive Makefile.

## Features

- **Backend:** Go REST API with health and ping endpoints
- **Frontend:** React 19 with TanStack Query, Tailwind CSS, and shadcn components
- **Databases:** PostgreSQL for persistence, Redis for caching
- **Development:** Hot reloading for both backend and frontend
- **Containerization:** Docker multi-stage builds for optimized images
- **Professional CLI:** Organized Makefile for all development tasks

## Prerequisites

- Docker and Docker Compose
- Git
- Node.js (v24+) and pnpm (for local frontend development)
- Go (v1.23+, optional for local backend development)

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

   This creates `.env` from `.env.example`. Update with your settings if needed.

3. **Start the full stack:**

   ```bash
   make dev
   ```

   - Backend API: `http://localhost:8080`
   - Frontend: `http://localhost:5173`
   - PostgreSQL: `localhost:5432`
   - Redis: `localhost:6379`

4. **View help for all available commands:**

   ```bash
   make help
   ```

## Available Commands

### Development

- `make dev` — Start full stack (backend + frontend + databases)
- `make dev:backend` — Backend only (Go + Redis + Postgres)
- `make dev:frontend` — Frontend only (Vite dev server, local)

### Building

- `make build` — Build all Docker images (production)
- `make build:backend` — Build backend image only
- `make build:frontend` — Build frontend image only

### Container Management

- `make up` — Start services in background
- `make down` — Stop all services
- `make restart` — Restart all services

### Monitoring

- `make logs` — Stream backend logs
- `make logs:backend` — Backend logs only
- `make logs:frontend` — Frontend logs only
- `make logs:all` — All service logs

### Code Quality

- `make fmt` — Format Go code
- `make lint` — Lint Go code
- `make install` — Install frontend dependencies

### Utilities

- `make env` — Initialize .env file
- `make clean` — Clean containers, volumes, and artifacts

## Project Structure

```
vibeshift/
├── cmd/
│   └── server/              # Go server entrypoint
├── internal/
│   ├── handlers/            # HTTP handlers
│   ├── server/              # Server setup
├── pkg/
│   ├── db/                  # PostgreSQL utilities
│   ├── redis/               # Redis client
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom hooks (useHealth)
│   │   ├── api/             # API utilities
│   │   ├── lib/             # Utilities and helpers
│   │   └── App.tsx          # Main app component
│   ├── Dockerfile           # Production Dockerfile
│   └── Dockerfile.dev       # Development Dockerfile
├── Dockerfile               # Backend Dockerfile
├── compose.yml              # Docker Compose orchestration
├── Makefile                 # Development CLI
└── .env.example             # Environment template
```

## Architecture

### Backend

- **Framework:** Go with net/http
- **Databases:** PostgreSQL (persistence), Redis (caching)
- **Features:** Graceful shutdown, health checks, CORS support

### Frontend

- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS with shadcn components
- **Data Fetching:** TanStack Query v5
- **Features:** Real-time health status, responsive design

### Services (Docker Compose)

1. **redis** — Caching layer
2. **postgres** — Data persistence
3. **app** — Go backend API
4. **frontend** — React development server

## Common Workflows

### Full Development Stack

```bash
make dev
# Backend: http://localhost:8080
# Frontend: http://localhost:5173
# Postgres: localhost:5432
# Redis: localhost:6379
```

### Backend-Only Development

```bash
make dev:backend
# Backend: http://localhost:8080
# Postgres: localhost:5432
# Redis: localhost:6379
```

### Frontend-Only Development (with backend proxy)

```bash
make dev:frontend
# Frontend: http://localhost:5173
# API proxied to http://localhost:8080/health and /ping
```

### Check Logs

```bash
# Backend logs
make logs:backend

# All logs
make logs:all

# Follow specific service
docker-compose logs -f frontend
```

### Code Quality

```bash
# Format Go code
make fmt

# Lint Go code
make lint

# Install frontend dependencies
make install
```

## Environment Variables

See `.env.example` for a complete list. Key variables:

- `GO_PORT` — Backend server port (default: 8080)
- `POSTGRES_DB` — PostgreSQL database name (default: aichat)
- `POSTGRES_USER` — PostgreSQL user (default: user)
- `POSTGRES_PASSWORD` — PostgreSQL password (required)
- `VITE_API_URL` — Frontend API URL (default: http://localhost:8080)

## Troubleshooting

### Services not starting?

Check logs:
```bash
make logs:all
```

### Database connection errors?

Ensure PostgreSQL is healthy:
```bash
docker-compose ps
```

Look for `(healthy)` status on postgres service.

### Frontend can't connect to backend?

In development, the frontend proxies requests to `http://localhost:8080`. Ensure the backend is running:
```bash
make dev:backend
```

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
