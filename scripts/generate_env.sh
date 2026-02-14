#!/usr/bin/env bash
set -euo pipefail

CFG="config.yml"

if [ ! -f "$CFG" ]; then
  echo "Creating $CFG from config.example.yml"
  cp config.example.yml "$CFG"
  echo "Please update $CFG with your settings if needed."
fi

if [ -f .env ]; then
  echo ".env already exists - skipping generation."
  exit 0
fi

extract_cfg() {
  local key="$1"
  if command -v yq >/dev/null 2>&1; then
    local yq_ver
    yq_ver="$(yq --version 2>/dev/null || true)"
    if echo "$yq_ver" | grep -E 'yq[^0-9]*4|version[^0-9]*4' >/dev/null 2>&1; then
      yq e ".${key}" -r "$CFG" 2>/dev/null || true
      return
    fi
    yq r "$CFG" "$key" -r 2>/dev/null || yq r "$CFG" "$key" 2>/dev/null || true
    return
  fi
  sed -n "s/^${key}:[[:space:]]*\"\\(.*\\)\"/\\1/p" "$CFG" 2>/dev/null || true
}

POSTGRES_USER="$(extract_cfg DB_USER)"
POSTGRES_DB="$(extract_cfg DB_NAME)"
POSTGRES_PASSWORD="$(extract_cfg DB_PASSWORD)"
GO_PORT="$(extract_cfg PORT)"
REDIS_URL="$(extract_cfg REDIS_URL)"

cat > .env <<EOF
APP_ENV=development
DB_AUTOMIGRATE_ALLOW_DESTRUCTIVE=false
DB_SCHEMA_MODE=sql
GO_PORT=${GO_PORT:-8375}
POSTGRES_DB=${POSTGRES_DB:-sanctum}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-password}
POSTGRES_USER=${POSTGRES_USER:-user}
REDIS_URL=${REDIS_URL:-localhost:6379}
IMAGE_UPLOAD_DIR=/var/sanctum/uploads/images
IMAGE_MAX_UPLOAD_SIZE_MB=10
EOF

if [ -f "infra/versions.env" ]; then
  echo "" >> .env
  echo "# Version catalog (sourced from infra/versions.env)" >> .env
  cat infra/versions.env >> .env
fi

echo "✓ .env generated (edit .env if needed)"
