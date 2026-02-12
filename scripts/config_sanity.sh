#!/usr/bin/env bash
set -euo pipefail

CFG_FILE="${1:-config.yml}"
if [ ! -f "$CFG_FILE" ]; then
  echo "Missing $CFG_FILE"
  exit 1
fi

get_cfg() {
  local key="$1"
  if command -v yq >/dev/null 2>&1; then
    local yq_ver
    yq_ver="$(yq --version 2>/dev/null || true)"
    if echo "$yq_ver" | grep -E 'yq[^0-9]*4|version[^0-9]*4' >/dev/null 2>&1; then
      yq e ".${key}" -r "$CFG_FILE" 2>/dev/null || true
      return
    fi
    yq r "$CFG_FILE" "$key" -r 2>/dev/null || yq r "$CFG_FILE" "$key" 2>/dev/null || true
    return
  fi
  sed -n "s/^${key}:[[:space:]]*\"\\(.*\\)\"/\\1/p" "$CFG_FILE" 2>/dev/null || true
}

APP_ENV="${APP_ENV:-$(get_cfg APP_ENV)}"
APP_ENV="${APP_ENV:-development}"
JWT_SECRET="${JWT_SECRET:-$(get_cfg JWT_SECRET)}"
DB_PASSWORD="${DB_PASSWORD:-$(get_cfg DB_PASSWORD)}"
DB_SCHEMA_MODE="${DB_SCHEMA_MODE:-$(get_cfg DB_SCHEMA_MODE)}"
DB_SCHEMA_MODE="${DB_SCHEMA_MODE:-hybrid}"

case "$DB_SCHEMA_MODE" in
  hybrid|sql|auto) ;;
  *)
    echo "Invalid DB_SCHEMA_MODE: $DB_SCHEMA_MODE"
    exit 1
    ;;
esac

if [ "$APP_ENV" = "production" ] || [ "$APP_ENV" = "prod" ]; then
  if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-super-secret-key-that-should-be-long-and-random" ] || [ ${#JWT_SECRET} -lt 32 ]; then
    echo "Production requires a strong JWT_SECRET (>=32 chars, non-default)."
    exit 1
  fi
  if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "password" ]; then
    echo "Production requires non-default DB_PASSWORD."
    exit 1
  fi
fi

echo "✓ Config sanity check passed (env=$APP_ENV, schema_mode=$DB_SCHEMA_MODE)"
