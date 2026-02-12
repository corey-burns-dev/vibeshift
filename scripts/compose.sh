#!/usr/bin/env bash
set -euo pipefail

args=(--env-file infra/versions.env)
if [ -f .env ]; then
  args+=(--env-file .env)
fi

exec docker compose "${args[@]}" "$@"
