#!/usr/bin/env bash
set -euo pipefail

VERSIONS_FILE="infra/versions.env"
if [ ! -f "$VERSIONS_FILE" ]; then
  echo "Missing $VERSIONS_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$VERSIONS_FILE"

assert_contains() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq "$expected" "$file"; then
    echo "Expected '$expected' in $file"
    exit 1
  fi
}

assert_not_contains() {
  local pattern="$1"
  shift
  if grep -n "$pattern" "$@" >/dev/null 2>&1; then
    echo "Found disallowed hardcoded version pattern: $pattern"
    grep -n "$pattern" "$@" || true
    exit 1
  fi
}

# CI workflow service images must align with the catalog
assert_contains ".github/workflows/ci.yml" "image: postgres:${POSTGRES_VERSION}"
assert_contains ".github/workflows/ci.yml" "image: redis:${REDIS_VERSION}"
assert_contains ".github/workflows/e2e-nightly.yml" "image: postgres:${POSTGRES_VERSION}"
assert_contains ".github/workflows/e2e-nightly.yml" "image: redis:${REDIS_VERSION}"
assert_contains ".github/workflows/nightly-race.yml" "image: postgres:${POSTGRES_VERSION}"
assert_contains ".github/workflows/nightly-race.yml" "image: redis:${REDIS_VERSION}"

# Dockerfiles must have ARG defaults matching catalog
assert_contains "Dockerfile" "ARG GO_VERSION=${GO_VERSION}"
assert_contains "Dockerfile" "ARG ALPINE_VERSION=${ALPINE_VERSION}"
assert_contains "frontend/Dockerfile" "ARG BUN_VERSION=${BUN_VERSION}"
assert_contains "frontend/Dockerfile" "ARG NGINX_VERSION=${NGINX_VERSION}"

# Compose files should use catalog env references
assert_contains "compose.yml" "image: postgres:\${POSTGRES_VERSION}"
assert_contains "compose.yml" "image: redis:\${REDIS_VERSION}"
assert_contains "compose.monitoring.yml" "image: prom/prometheus:\${PROMETHEUS_VERSION}"
assert_contains "compose.monitoring.yml" "image: grafana/loki:\${LOKI_VERSION}"
assert_contains "compose.monitoring.yml" "image: grafana/promtail:\${PROMTAIL_VERSION}"
assert_contains "compose.monitoring.yml" "image: grafana/grafana:\${GRAFANA_VERSION}"
assert_contains "compose.monitoring.yml" "image: gcr.io/cadvisor/cadvisor:\${CADVISOR_VERSION}"
assert_contains "compose.monitor-lite.yml" "image: amir20/dozzle:\${DOZZLE_VERSION}"
assert_contains "compose.monitor-lite.yml" "image: louislam/uptime-kuma:\${UPTIME_KUMA_VERSION}"

# Managed images should not be hardcoded in compose files
assert_not_contains "image:\\s*postgres:[0-9]" compose*.yml
assert_not_contains "image:\\s*redis:[0-9]" compose*.yml
assert_not_contains "image:\\s*grafana/grafana:[0-9]" compose*.yml
assert_not_contains "image:\\s*grafana/loki:[0-9]" compose*.yml
assert_not_contains "image:\\s*grafana/promtail:[0-9]" compose*.yml
assert_not_contains "image:\\s*prom/prometheus:v?[0-9]" compose*.yml

echo "✓ Version catalog consistency check passed"
