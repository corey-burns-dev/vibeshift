#!/bin/sh
set -e

# Wait for Postgres to be ready
echo "Waiting for test database to be ready at $DB_HOST:$DB_PORT..."

# Use a loop to wait for the database to be ready
# PGPASSWORD is used to provide the password for psql
for i in {1..60}; do
    if PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; then
        echo "Test database is ready!"
        break
    fi
    echo "Attempt $i: Database not ready. Retrying in 1 second..."
    sleep 1
done

# Exit if the database is not ready after all attempts
if [ $i -eq 60 ]; then
  echo "Database not ready after 60 seconds. Exiting."
  exit 1
fi


echo "Seeding the test database..."
# Ensure we are in the correct directory before seeding
cd /app/backend
go run ./cmd/seed/main.go

echo "Running backend tests with coverage..."

# Run tests and generate coverage profile
# The -race flag is added to detect race conditions
go test -race -coverprofile=coverage.out -covermode=atomic ./...

# Generate HTML coverage report
go tool cover -html=coverage.out -o coverage.html

# Output coverage percentage
go tool cover -func=coverage.out

echo "Tests passed and coverage reports generated."
echo "HTML report available at: backend/coverage.html"