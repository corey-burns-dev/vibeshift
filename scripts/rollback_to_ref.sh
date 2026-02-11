#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/rollback_to_ref.sh <target_ref> [--execute]

Default mode is dry-run (prints commands only).
Use --execute to perform the rollback:
  1) checkout target git ref
  2) redeploy compose stack
  3) verify /health/ready
  4) auto-rollback to previous ref if health check fails
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

TARGET_REF="$1"
MODE="${2:-}"
EXECUTE=false
if [[ "${MODE}" == "--execute" ]]; then
  EXECUTE=true
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! git rev-parse --verify "${TARGET_REF}" >/dev/null 2>&1; then
  echo "target ref does not exist: ${TARGET_REF}" >&2
  exit 1
fi

CURRENT_REF="$(git rev-parse --short HEAD)"
TARGET_SHA="$(git rev-parse --short "${TARGET_REF}")"

echo "Current ref: ${CURRENT_REF}"
echo "Target ref:  ${TARGET_SHA} (${TARGET_REF})"

if ! ${EXECUTE}; then
  cat <<EOF

Dry-run rollback plan:
  git checkout ${TARGET_REF}
  docker compose -f compose.yml -f compose.prod.yml up -d --build
  curl -sf http://localhost:8375/health/ready

If health check fails:
  git checkout ${CURRENT_REF}
  docker compose -f compose.yml -f compose.prod.yml up -d --build
EOF
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "working tree is not clean; refusing rollback execute mode" >&2
  exit 1
fi

rollback_current() {
  echo "Rollback failed. Restoring previous ref ${CURRENT_REF}."
  git checkout "${CURRENT_REF}"
  docker compose -f compose.yml -f compose.prod.yml up -d --build
}

trap rollback_current ERR

git checkout "${TARGET_REF}"
docker compose -f compose.yml -f compose.prod.yml up -d --build

echo "Waiting for readiness..."
for _ in $(seq 1 30); do
  if curl -sf http://localhost:8375/health/ready >/dev/null; then
    echo "Rollback deploy healthy on ${TARGET_SHA}"
    trap - ERR
    exit 0
  fi
  sleep 2
done

echo "health check timed out" >&2
exit 1
