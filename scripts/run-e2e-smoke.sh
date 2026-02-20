#!/usr/bin/env bash
set -euo pipefail

if [ "${SKIP_E2E_PRE_PUSH:-}" = "1" ]; then
  echo "Skipping e2e pre-push check (SKIP_E2E_PRE_PUSH=1)"
  exit 0
fi

echo "Installing Playwright browsers (best-effort)..."
# repository root absolute path
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/frontend" || exit 1

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env"
  set +a
fi

USE_DOCKER_PLAYWRIGHT=0
if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found in PATH — will run Playwright inside the e2e 'playwright' container instead." >&2
  USE_DOCKER_PLAYWRIGHT=1
else
  # attempt to install browsers if script exists
  if bun -v >/dev/null 2>&1; then
    bun run test:e2e:install || true
  fi
fi

echo "Running Playwright smoke tests (grep @smoke)..."
# Use configurable workers (default: 2 for good balance of speed and stability)
# Set E2E_WORKERS=1 to force sequential execution if needed
WORKERS=${E2E_WORKERS:-2}
# Ensure a test Postgres is available. If not, bring up the e2e compose stack
# which defines `postgres_test` with known credentials (compose.e2e.override.yml).
PGHOST=${PGHOST:-localhost}
# postgres_test maps to host port 5433 in compose.override.yml; prefer that for e2e
PGPORT=${PGPORT:-5433}
PGUSER=${PGUSER:-${POSTGRES_USER:-sanctum_user}}
PGPASSWORD=${PGPASSWORD:-${POSTGRES_PASSWORD:-sanctum_password}}
PGDATABASE=${PGDATABASE:-${POSTGRES_DB:-sanctum_test}}

# export DB vars for Playwright/global-setup to consume
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
export DB_HOST="$PGHOST" DB_PORT="$PGPORT" DB_USER="$PGUSER" DB_PASSWORD="$PGPASSWORD" DB_NAME="$PGDATABASE"
# Ensure frontend dev server uses the correct API URL on the host
export VITE_API_URL="http://localhost:8375/api"

# Ensure the e2e compose stack is up with correct environment (compose.e2e.override.yml).
# We use --force-recreate for 'app' to ensure any dev-mode environment variables are replaced.
echo "Ensuring e2e compose stack is up..."
# avoid host Redis port conflicts when running e2e
export REDIS_HOST_PORT=${REDIS_HOST_PORT:-6380}
(cd "$REPO_ROOT" && "$REPO_ROOT/scripts/compose.sh" -f compose.yml -f compose.override.yml -f compose.e2e.override.yml up -d --force-recreate --wait --wait-timeout 120 postgres_test redis app)

# Stop any running Docker frontend container so Playwright's webServer uses the
# host-side Vite dev server (fresh node_modules). The Docker frontend image may
# have a stale node_modules volume from before a package update, which causes the
# React app to render blank pages for all routes.
if command -v docker >/dev/null 2>&1; then
  FRONTEND_CID=$(docker ps -q --filter "name=sanctum-frontend" 2>/dev/null || true)
  if [ -n "$FRONTEND_CID" ]; then
    echo "Stopping Docker frontend container so host Vite dev server is used..."
    docker stop "$FRONTEND_CID" >/dev/null
  fi
fi

if command -v psql >/dev/null 2>&1; then
  if ! PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c '\q' >/dev/null 2>&1; then
    echo "Waiting briefly for DB to accept connections..."
    sleep 5
  fi
fi

if [ "$USE_DOCKER_PLAYWRIGHT" = "1" ]; then
  echo "Building and running Playwright inside compose 'playwright' service..."
  (cd "$REPO_ROOT" && "$REPO_ROOT/scripts/compose.sh" -f compose.yml -f compose.override.yml -f compose.e2e.override.yml build --no-cache playwright)
  (cd "$REPO_ROOT" && "$REPO_ROOT/scripts/compose.sh" -f compose.yml -f compose.override.yml -f compose.e2e.override.yml run --rm playwright npx playwright test --grep @smoke --workers=$WORKERS)
else
  bun run test:e2e -- --grep @smoke --workers=$WORKERS
fi
