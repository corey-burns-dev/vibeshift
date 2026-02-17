#!/usr/bin/env bash
set -euo pipefail

# Safe, idempotent migration script to move Playwright E2E tests
# from frontend/test/tests/e2e -> frontend/test/e2e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT_DIR/frontend/test/tests/e2e"
DEST="$ROOT_DIR/frontend/test/e2e"

if [ ! -d "$SRC" ]; then
  echo "No legacy e2e folder found at $SRC. Nothing to do."
  exit 0
fi

mkdir -p "$DEST"

echo "Migrating Playwright E2E from $SRC to $DEST"

# Use git mv when possible to preserve history
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Using git to move files..."
  # move everything inside SRC into DEST preserving subdirs
  shopt -s dotglob
  for f in "$SRC"/*; do
    # skip if nothing
    [ -e "$f" ] || continue
    base=$(basename "$f")
    if [ -e "$DEST/$base" ]; then
      echo "DEST exists for $base; merging contents"
      # move children individually
      for child in "$f"/*; do
        [ -e "$child" ] || continue
        git mv "$child" "$DEST/" || mv "$child" "$DEST/"
      done
      # remove empty source dir
      rmdir "$f" 2>/dev/null || true
    else
      git mv "$f" "$DEST/" || mv "$f" "$DEST/"
    fi
  done
else
  echo "Not a git repo; using filesystem moves"
  mv -v "$SRC"/* "$DEST/" || true
fi

echo "Migration complete. Please update paths in Playwright config if needed."
echo "Current Playwright config path: frontend/playwright.config.ts -> test/tests/e2e"
echo "If you want Playwright to use the new folder, update 'testDir' and 'globalSetup/globalTeardown' to './test/e2e/...'."

exit 0
