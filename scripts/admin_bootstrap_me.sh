#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: scripts/admin_bootstrap_me.sh <email>"
  exit 1
fi

EMAIL="$1"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-${POSTGRES_USER:-sanctum_user}}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-sanctum_password}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-sanctum}}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not found in PATH"
  exit 1
fi

if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM users WHERE email='${EMAIL}' LIMIT 1" | grep -q 1; then
  echo "No user found with email: $EMAIL"
  echo "Create the account first via /signup, then run this command again."
  exit 1
fi

echo "Promoting $EMAIL as the only admin in database '$DB_NAME'..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<SQL
BEGIN;
UPDATE users SET is_admin = FALSE WHERE is_admin = TRUE;
UPDATE users SET is_admin = TRUE WHERE email = '${EMAIL}';
COMMIT;
SQL

echo "Current admins:"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, username, email, is_admin FROM users WHERE is_admin = TRUE ORDER BY id;"

echo "Done. If you are logged in already, log out and back in so the frontend refreshes your is_admin claim."
