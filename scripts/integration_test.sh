#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="compose.yml"
PORT="${GO_PORT:-8080}"
RETRIES=60

# Prefer the classic docker-compose binary, fall back to the Docker CLI 'compose' plugin.
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
elif command -v "docker" >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
else
  echo "ERROR: neither 'docker-compose' nor 'docker compose' is available" >&2
  exit 1
fi

# Build and start services
# Export default env vars used by compose when not provided (use safe defaults for CI)
export POSTGRES_USER="${POSTGRES_USER:-user}"
export POSTGRES_DB="${POSTGRES_DB:-aichat}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-testpassword}"
export REDIS_URL="${REDIS_URL:-redis://redis:6379}"

${COMPOSE_CMD} -f "$COMPOSE_FILE" up -d --build

# Ensure we always tear down compose on exit
cleanup() {
  docker-compose -f "$COMPOSE_FILE" down -v
}
trap cleanup EXIT

echo "Waiting for app to be healthy on http://localhost:$PORT/health..."
for i in $(seq 1 $RETRIES); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "\nApp is healthy"
    break
  fi
  printf '.'
  sleep 1
done

if ! curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
  echo "\nERROR: app did not become healthy after ${RETRIES} seconds"
  echo "--- app logs ---"
  ${COMPOSE_CMD} -f "$COMPOSE_FILE" logs --no-color app || true
  exit 1
fi

echo "Running endpoint checks..."
curl -sS "http://localhost:$PORT/health"
curl -sS "http://localhost:$PORT/ping"

echo "Integration tests passed"
