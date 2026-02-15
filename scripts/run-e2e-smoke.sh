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

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found in PATH — cannot run Playwright smoke tests. Install Bun or run tests manually." >&2
  exit 0
fi

# attempt to install browsers if script exists
if bun -v >/dev/null 2>&1; then
  bun run test:e2e:install || true
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
PGUSER=${PGUSER:-sanctum_user}
PGPASSWORD=${PGPASSWORD:-sanctum_password}
PGDATABASE=${PGDATABASE:-sanctum_test}

# export DB vars for Playwright/global-setup to consume
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
export DB_HOST="$PGHOST" DB_PORT="$PGPORT" DB_USER="$PGUSER" DB_PASSWORD="$PGPASSWORD" DB_NAME="$PGDATABASE"
# Ensure frontend dev server uses the correct API URL on the host
export VITE_API_URL="http://localhost:8375/api"

if command -v psql >/dev/null 2>&1; then
  if ! PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c '\q' >/dev/null 2>&1; then
    echo "Postgres not reachable with $PGUSER@$PGHOST:$PGPORT/$PGDATABASE — bringing up e2e compose stack..."
    # run compose.sh from the repo root so its relative env-file paths resolve
    (cd "$REPO_ROOT" && "$REPO_ROOT/scripts/compose.sh" -f compose.yml -f compose.override.yml -f compose.e2e.override.yml up -d --wait --wait-timeout 120 postgres_test redis app)
    echo "Waiting briefly for DB to accept connections..."
    sleep 5
  fi
else
  echo "psql not found — skipping direct DB check. Ensure test DB is available before running e2e."
fi

bun run test:e2e -- --grep @smoke --workers=$WORKERS
