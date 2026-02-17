#!/usr/bin/env bash
set -eu

# Wait for dependencies (redis, postgres, app) to be reachable before running tests.
# Usage: WAIT_TIMEOUT=120 ./wait-for-e2e.sh

TIMEOUT=${WAIT_TIMEOUT:-120}
SLEEP_INTERVAL=2

wait_tcp() {
  host=$1
  port=$2
  deadline=$((SECONDS+TIMEOUT))
  while [ $SECONDS -lt $deadline ]; do
    if (</dev/tcp/$host/$port) >/dev/null 2>&1; then
      echo "tcp $host:$port reachable"
      return 0
    fi
    sleep $SLEEP_INTERVAL
  done
  echo "timeout waiting for tcp $host:$port" >&2
  return 1
}

wait_http_ok() {
  url=$1
  deadline=$((SECONDS+TIMEOUT))
  while [ $SECONDS -lt $deadline ]; do
    if curl --fail -sS --max-time 2 "$url" >/dev/null 2>&1; then
      echo "http $url OK"
      return 0
    fi
    sleep $SLEEP_INTERVAL
  done
  echo "timeout waiting for http $url" >&2
  return 1
}

echo "Waiting for e2e dependencies (timeout=${TIMEOUT}s)"

echo "Checking Redis..."
wait_tcp redis 6379

echo "Checking Postgres..."
wait_tcp postgres 5432

echo "Checking App HTTP health..."
wait_http_ok http://app:8375/health/ready

echo "Dependency wait finished; execing CMD"

exec "$@"
