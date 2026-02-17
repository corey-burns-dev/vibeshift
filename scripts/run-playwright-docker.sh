#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_NAME=${IMAGE_NAME:-sanctum/playwright:local}
DOCKERFILE=${DOCKERFILE:-frontend/Dockerfile.e2e}

PLAYWRIGHT_ARGS=${@:-}

echo "Building Playwright image (${IMAGE_NAME})..."
docker build -f "$REPO_ROOT/$DOCKERFILE" -t "$IMAGE_NAME" "$REPO_ROOT"

mkdir -p "$REPO_ROOT/frontend/reports"

# Map current user to avoid root-owned artifacts when possible
DOCKER_USER="$(id -u 2>/dev/null || echo 0):$(id -g 2>/dev/null || echo 0)"

echo "Running Playwright inside container (artifacts -> frontend/reports)..."
docker run --rm \
  --network host \
  -u "$DOCKER_USER" \
  -e PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:5173}" \
  -e PLAYWRIGHT_API_URL="${PLAYWRIGHT_API_URL:-http://localhost:8375/api}" \
  -e DB_HOST="${DB_HOST:-localhost}" -e DB_PORT="${DB_PORT:-5432}" \
  -e DB_USER="${DB_USER:-sanctum_user}" -e DB_PASSWORD="${DB_PASSWORD:-sanctum_password}" \
  -e DB_NAME="${DB_NAME:-sanctum_test}" \
  -v "$REPO_ROOT/frontend/reports":/app/reports \
  "$IMAGE_NAME" npx playwright test ${PLAYWRIGHT_ARGS}

echo "Artifacts available in frontend/reports/"
