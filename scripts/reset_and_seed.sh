#!/bin/bash
# Reset and recreate the Postgres database, then run migrations and seed data
set -e

	# Load DB credentials from .env (used by docker compose)
	set -a
	source .env
	set +a

	# Stop app service to release DB connections
	echo "Stopping app service to release DB connections..."
	docker compose stop app

	# Use docker compose to exec into the postgres container
	echo "Dropping and recreating database $POSTGRES_DB in docker..."
	docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"
	docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\";"

# Run migrations (auto-migrate will run on backend start)
# Seed the database
echo "Seeding database..."
cd backend && go run cmd/seed/main.go

	# Restart app service
	echo "Restarting app service..."
	docker compose start app
echo "Database reset and reseeded!"
