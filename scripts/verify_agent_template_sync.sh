#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/.github/agents"
DST_DIR="$ROOT_DIR/docs/agents/templates"

if [ ! -d "$SRC_DIR" ] || [ ! -d "$DST_DIR" ]; then
  echo "missing template directories" >&2
  exit 1
fi

if diff -ru "$SRC_DIR" "$DST_DIR" >/dev/null; then
  echo "agent templates are in sync"
  exit 0
fi

echo "agent template drift detected between .github/agents and docs/agents/templates" >&2
echo "run: scripts/sync_agent_templates.sh" >&2
exit 1
