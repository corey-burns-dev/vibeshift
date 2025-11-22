#!/usr/bin/env bash
set -euo pipefail

CFG="config.yml"

if [ ! -f "$CFG" ]; then
  echo "Creating $CFG from config.example.yml";
  cp config.example.yml "$CFG";
  echo "Please update $CFG with your settings if needed.";
fi

if [ -f .env ]; then
  echo ".env already exists — skipping generation.";
  exit 0
fi

if command -v yq >/dev/null 2>&1; then
  YQ_VER=$(yq --version 2>/dev/null || true)
  if echo "$YQ_VER" | grep -E 'yq[^0-9]*4|version[^0-9]*4' >/dev/null 2>&1; then
    POSTGRES_USER=$(yq e '.DB_USER' -r "$CFG" || true)
    POSTGRES_DB=$(yq e '.DB_NAME' -r "$CFG" || true)
    POSTGRES_PASSWORD=$(yq e '.DB_PASSWORD' -r "$CFG" || true)
    GO_PORT=$(yq e '.PORT' -r "$CFG" || true)
    REDIS_URL=$(yq e '.REDIS_URL' -r "$CFG" || true)
  else
    POSTGRES_USER=$(yq r "$CFG" DB_USER -r 2>/dev/null || yq r "$CFG" DB_USER 2>/dev/null || true)
    POSTGRES_DB=$(yq r "$CFG" DB_NAME -r 2>/dev/null || yq r "$CFG" DB_NAME 2>/dev/null || true)
    POSTGRES_PASSWORD=$(yq r "$CFG" DB_PASSWORD -r 2>/dev/null || yq r "$CFG" DB_PASSWORD 2>/dev/null || true)
    GO_PORT=$(yq r "$CFG" PORT -r 2>/dev/null || yq r "$CFG" PORT 2>/dev/null || true)
    REDIS_URL=$(yq r "$CFG" REDIS_URL -r 2>/dev/null || yq r "$CFG" REDIS_URL 2>/dev/null || true)
  fi
else
  POSTGRES_USER=$(sed -n 's/^DB_USER:[[:space:]]*"\(.*\)"/\1/p' "$CFG" || true)
  POSTGRES_DB=$(sed -n 's/^DB_NAME:[[:space:]]*"\(.*\)"/\1/p' "$CFG" || true)
  POSTGRES_PASSWORD=$(sed -n 's/^DB_PASSWORD:[[:space:]]*"\(.*\)"/\1/p' "$CFG" || true)
  GO_PORT=$(sed -n 's/^PORT:[[:space:]]*"\(.*\)"/\1/p' "$CFG" || true)
  REDIS_URL=$(sed -n 's/^REDIS_URL:[[:space:]]*"\(.*\)"/\1/p' "$CFG" || true)
fi

cat > .env <<EOF
POSTGRES_USER=${POSTGRES_USER:-}
POSTGRES_DB=${POSTGRES_DB:-}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-}
GO_PORT=${GO_PORT:-}
REDIS_URL=${REDIS_URL:-}
EOF

echo "✓ .env generated (edit .env if needed)"
