#!/usr/bin/env bash
set -euo pipefail

# Move existing frontend test artifacts into `frontend/reports/`.
# Run from repository root: `./scripts/migrate-frontend-reports.sh`

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
DEST_DIR="$FRONTEND_DIR/reports"

mkdir -p "$DEST_DIR"

move_if_exists() {
  src="$1"
  dst="$2"
  if [ -e "$src" ]; then
    echo "Moving $src -> $dst"
    mv "$src" "$dst"
  else
    echo "Not found: $src"
  fi
}

move_if_exists "$FRONTEND_DIR/playwright-report" "$DEST_DIR/playwright-report"
move_if_exists "$FRONTEND_DIR/test-results" "$DEST_DIR/test-results"
move_if_exists "$FRONTEND_DIR/coverage" "$DEST_DIR/coverage"
move_if_exists "$FRONTEND_DIR/test" "$DEST_DIR/test"

echo "Migration complete. Verify files in $DEST_DIR"
