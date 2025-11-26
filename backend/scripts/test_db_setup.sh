#!/usr/bin/env bash
set -euo pipefail

# This script runs DB migrations and seeds the test database.
# It is intended to be run inside the backend container or with Go installed.

export DB_HOST=${DB_HOST:-postgres_test}
export DB_PORT=${DB_PORT:-5432}
export DB_USER=${DB_USER:-vibeshift_user}
export DB_PASSWORD=${DB_PASSWORD:-vibeshift_password}
export DB_NAME=${DB_NAME:-vibeshift_test}

# Wait for Postgres to be ready
echo "Waiting for test database to be ready at $DB_HOST:$DB_PORT..."
for i in {1..60}; do
	if PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; then
		echo "Test database is ready!"
		break
	fi
	sleep 1
done

# Run seeder
cd "$(dirname "$0")/.."
go run ./cmd/seed/main.go
