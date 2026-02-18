# Plan: Docker Configuration Optimization

## Context

The project has 7 compose files and 6 Dockerfiles. Goal is to reduce duplication and simplify the Docker config without changing behavior.

---

## Current State

### Compose files (7)
| File | Purpose |
|---|---|
| `compose.yml` | Base: app, postgres, redis, frontend |
| `compose.override.yml` | Dev: hot-reload, ports, media-server, test DB |
| `compose.e2e.override.yml` | E2E: playwright service, test env vars |
| `compose.e2e.no-sysctls.override.yml` | CI workaround: removes redis sysctls (one-liner) |
| `compose.stress.yml` | Stress: sets APP_ENV=stress (two-liner) |
| `compose.monitoring.yml` | Full observability stack (Prometheus, Loki, Grafana, cAdvisor) |
| `compose.monitor-lite.yml` | Lightweight monitoring (Dozzle, Uptime Kuma) |

### Dockerfiles (6)
| File | Purpose |
|---|---|
| `Dockerfile` | Production backend |
| `Dockerfile.dev` | Dev backend (air hot-reload) |
| `Dockerfile.test` | Backend test runner |
| `frontend/Dockerfile` | Production frontend (nginx) |
| `frontend/Dockerfile.dev` | Dev frontend (vite) |
| `frontend/Dockerfile.e2e` | E2E test runner (playwright/ubuntu) |

---

## Recommended Changes

### 1. Merge backend Dockerfiles → single multi-stage `Dockerfile`

Replace `Dockerfile`, `Dockerfile.dev`, `Dockerfile.test` with one file using named stages:

```dockerfile
# Stage: base — shared Go toolchain
FROM golang:${GO_VERSION} AS base
RUN apk add --no-cache libwebp-dev
WORKDIR /app

# Stage: dev — air hot-reload
FROM base AS dev
RUN go install github.com/air-verse/air@latest
EXPOSE 8375
CMD ["air", "-c", ".air.toml"]

# Stage: test — race detection + pg client
FROM base AS test
RUN apk add --no-cache postgresql-client bash build-base
ENV CGO_ENABLED=1
CMD ["go", "test", "-v", "./..."]

# Stage: build — compile binary
FROM base AS build
COPY . .
RUN go build -ldflags="-w -s" -o /bin/server ./backend

# Stage: production — minimal runtime image
FROM alpine:3.23 AS production
RUN adduser -D -u 10001 nonroot
COPY --from=build /bin/server /bin/server
USER nonroot
EXPOSE 8375
CMD ["/bin/server"]
```

Compose files reference via `build.target: dev / test / production`.

**Files deleted:** `Dockerfile.dev`, `Dockerfile.test`

### 2. Merge frontend Dockerfiles → single multi-stage `frontend/Dockerfile`

Replace `frontend/Dockerfile` and `frontend/Dockerfile.dev` with one file:

```dockerfile
# Stage: deps — install node_modules
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Stage: dev — vite dev server
FROM oven/bun:${BUN_VERSION} AS dev
WORKDIR /app
EXPOSE 5173
CMD ["bun", "run", "dev"]

# Stage: build — vite production build
FROM deps AS build
COPY . .
RUN bun run build

# Stage: production — nginx static serving
FROM nginx:${NGINX_VERSION} AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**File deleted:** `frontend/Dockerfile.dev`
`frontend/Dockerfile.e2e` stays as-is (Ubuntu base + Playwright, too different to merge)

### 3. Remove redis sysctls from `compose.override.yml` → delete `compose.e2e.no-sysctls.override.yml`

Sysctls are not needed locally (confirmed). Remove the `sysctls:` block from the `redis` service in `compose.override.yml`. The no-sysctls file becomes unnecessary.

**File deleted:** `compose.e2e.no-sysctls.override.yml`

### 4. Fold `compose.stress.yml` → `compose.override.yml` via env var

Expose `APP_ENV` as an env var with default in `compose.override.yml`:

```yaml
# In compose.override.yml — app service
environment:
  APP_ENV: ${APP_ENV:-development}
```

Stress testing becomes `APP_ENV=stress docker compose up` — no separate file needed.

**File deleted:** `compose.stress.yml`

### 5. Centralize credentials via `.env` references

Stop hardcoding `sanctum_user`/`password` literals in compose files. Both `compose.yml` and `compose.e2e.override.yml` reference the same env vars:

```yaml
# compose.yml postgres service
POSTGRES_USER: ${POSTGRES_USER:-sanctum_user}
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}

# compose.e2e.override.yml app service
DB_USER: ${POSTGRES_USER:-sanctum_user}
DB_PASSWORD: ${POSTGRES_PASSWORD:-password}
```

### 6. Standardize hardcoded ports with env var defaults

Add to `.env`:
```
VITE_PORT=5173
RTMP_PORT=1935
HLS_PORT=8082
```

Reference in `compose.override.yml` instead of hardcoded values.

---

## Files Changed

| File | Change |
|---|---|
| `Dockerfile` | Absorb `Dockerfile.dev` and `Dockerfile.test` as named stages |
| `Dockerfile.dev` | **Delete** |
| `Dockerfile.test` | **Delete** |
| `frontend/Dockerfile` | Absorb `frontend/Dockerfile.dev` as named stages |
| `frontend/Dockerfile.dev` | **Delete** |
| `compose.override.yml` | Update build targets; remove sysctls; add `APP_ENV` var; standardize ports |
| `compose.yml` | Parametrize credentials |
| `compose.e2e.override.yml` | Dedup credentials to use env vars |
| `compose.e2e.no-sysctls.override.yml` | **Delete** |
| `compose.stress.yml` | **Delete** |
| `.env` | Add VITE_PORT, RTMP_PORT, HLS_PORT defaults |

**Net result: 6 Dockerfiles → 4, 7 compose files → 5**

---

## What NOT to change

- `compose.monitoring.yml` and `compose.monitor-lite.yml` — distinct opt-in stacks, keep separate
- `frontend/Dockerfile.e2e` — Ubuntu base with Playwright is too different to merge
- The override file pattern — idiomatic Compose, works well

---

## Verification

After changes:
1. `docker compose up --build` — full dev stack starts cleanly
2. `docker compose --profile test run backend-test` — backend tests pass
3. `docker compose -f compose.yml -f compose.e2e.override.yml up` — e2e stack starts
4. `docker compose -f compose.yml -f compose.monitoring.yml up` — monitoring stack starts
5. `APP_ENV=stress docker compose up` — stress mode works
6. Build all targets explicitly:
   - `docker build --target dev .`
   - `docker build --target test .`
   - `docker build --target production .`
   - `docker build --target dev frontend/`
   - `docker build --target production frontend/`
