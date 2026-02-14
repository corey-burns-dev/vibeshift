#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/.github/agents"
DST_DIR="$ROOT_DIR/docs/agents/templates"

if [ ! -d "$SRC_DIR" ]; then
  echo "missing source dir: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$DST_DIR"

# Keep mirror exact by default.
rsync -a --delete "$SRC_DIR/" "$DST_DIR/"

echo "synced: $SRC_DIR -> $DST_DIR"
