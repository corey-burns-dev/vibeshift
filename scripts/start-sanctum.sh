#!/usr/bin/env bash
set -euo pipefail

# scripts/start-sanctum.sh
# Inspired by media-stack's start-secrets.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_DIR="$ROOT_DIR/secrets"
COMPOSE_FILE="$ROOT_DIR/compose.local.yml"

# Load .env if it exists
if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
fi

# Set defaults for PUID/PGID if not set
export PUID=${PUID:-$(id -u)}
export PGID=${PGID:-$(id -g)}
export TZ=${TZ:-UTC}

# Function to export secrets
_export_secret() {
  local file="$1" varname="$2"
  if [ -f "$file" ]; then
    local val
    val=$(grep -v '^#' "$file" | grep -v '^$' | head -n 1 | tr -d '\r' | xargs)
    if [ -n "$val" ]; then
      export "$varname"="$val"
      echo "Exported $varname from $file"
    fi
  else
    echo "Warning: Secret file $file not found"
  fi
}

# Export required secrets
_export_secret "$SECRETS_DIR/postgres_password" POSTGRES_PASSWORD
_export_secret "$SECRETS_DIR/dev_root_password" DEV_ROOT_PASSWORD

# Start the stack
docker compose -f "$COMPOSE_FILE" up -d

echo "Sanctum is starting..."
echo "Gateway is accessible locally at http://127.0.0.1:8080"
echo "Check logs with: docker compose -f compose.local.yml logs -f"
