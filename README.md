# Sanctum

Sanctum is a Reddit-style social platform focused on creativity, hobbies, and shared interests, without politics, religion, or news-driven discourse.

## Features

- **Community Feed:** Threaded post-and-reply experience for interest-based communities
- **Backend:** Go REST API with health and ping endpoints
- **Frontend:** React 19 with TanStack Query, Tailwind CSS, and shadcn components
- **Databases:** PostgreSQL for persistence, Redis for caching
- **Development:** Hot reloading for both backend and frontend
- **Containerization:** Docker multi-stage builds for optimized images
- **Developer Workflow:** Organized Makefile for common development tasks

## Prerequisites

- Docker and Docker Compose
- Git
- Node.js (v24+) and Bun (for local frontend development)
- Go (v1.23+, optional for local backend development)

## Quick Start

1. **Clone the repository:**

   ```bash
   git clone https://github.com/corey-burns-dev/sanctum.git
   cd sanctum
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

   - Backend API: `http://localhost:8375`
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
- `make dev-backend` — Backend only (Go + Redis + Postgres)
- `make dev-frontend` — Frontend only (Vite dev server, local)

### Building

- `make build` — Build all Docker images (production)
- `make build-backend` — Build backend image only
- `make build-frontend` — Build frontend image only

### Container Management

- `make up` — Start services in background
- `make down` — Stop all services
- `make restart` — Restart all services

### Monitoring

- `make logs` — Stream backend logs
- `make logs-backend` — Backend logs only
- `make logs-frontend` — Frontend logs only
- `make logs-all` — All service logs

### Code Quality

- `make fmt` — Format Go code
- `make lint` — Lint Go code
- `make fmt-frontend` — Format frontend code (Biome)
- `make lint-frontend` — Lint frontend code (Biome)
- `make install` — Install frontend dependencies

### Utilities

- `make env` — Initialize .env file
- `make clean` — Clean containers, volumes, and artifacts

### Admin Role

- `make admin-list` — List current admin users
- `make admin-promote user_id=<id>` — Promote a user to admin
- `make admin-demote user_id=<id>` — Demote an admin user
- `make admin-bootstrap-me email=<email>` — Make exactly one admin (you)

Admin guide: `docs/ADMIN_ROLE.md`

Signup Sanctum onboarding TODO and backend endpoint contract:
`docs/ONBOARDING_SANCTUMS_TODO.md`

## Project Structure

```txt
sanctum/
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

- **Framework:** Go with [Fiber](https://gofiber.io)
- **Databases:** PostgreSQL (persistence), Redis (caching)
- **Features:** Graceful shutdown, health checks, CORS support

### Frontend

- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS with shadcn components
- **Data Fetching:** TanStack Query v5
- **Code Quality:** Biome for linting and formatting
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
```

- Backend: `http://localhost:8375`
- Frontend: `http://localhost:5173`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

### Backend-Only Development

```bash
make dev-backend
```

### Frontend-Only Development

```bash
make install
make dev-frontend
```

## License

MIT
