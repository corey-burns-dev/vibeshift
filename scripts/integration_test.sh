#!/usr/bin/env bash
set -euo pipefail

# Build and start services
docker-compose -f compose.yml up -d --build

# Wait for app to become healthy
echo "Waiting for app to be healthy..."
for i in {1..30}; do
  if docker exec "$(docker ps -qf "name=vibeshift-app-1")" sh -c "curl -sf http://localhost:8080/health" >/dev/null 2>&1; then
    echo "App is healthy"
    break
  fi
  sleep 1
done

# Test endpoints
curl -f http://localhost:8080/health
curl -f http://localhost:8080/ping

# Cleanup
docker-compose -f compose.yml down -v

echo "Integration tests passed"
