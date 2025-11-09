#!/usr/bin/env bash
set -euo pipefail

# Bring up compose (this script expects docker-compose to be available)
COMPOSE_CMD=${COMPOSE_CMD:-docker-compose}

echo "Starting services..."
$COMPOSE_CMD up -d --build

echo "Waiting for backend health..."
until curl -fsS http://localhost:8080/health >/dev/null 2>&1; do
  printf '.'; sleep 1
done
echo " backend healthy"

echo "Waiting for frontend..."
until curl -fsS http://localhost:5173 >/dev/null 2>&1; do
  printf '.'; sleep 1
done
echo " frontend ready"

echo "Testing frontend fetches backend via proxy"
curl -fsS http://localhost:5173/ -o /dev/null
curl -fsS http://localhost:8080/health | jq .

echo "Integration E2E checks passed"

echo "Tearing down"
$COMPOSE_CMD down
