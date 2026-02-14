#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_PATH="$ROOT_DIR/docs/reports/REPORT_TEMPLATE.md"
REPORTS_DIR="$ROOT_DIR/docs/reports"

usage() {
  echo "Usage: $0 <slug>"
  echo "Example: $0 auth-refresh-fix"
}

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

SLUG="$1"
if [[ ! "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
  echo "Invalid slug: '$SLUG'"
  echo "Use lowercase letters, numbers, and dashes only."
  exit 1
fi

if [ ! -f "$TEMPLATE_PATH" ]; then
  echo "Template missing: $TEMPLATE_PATH"
  exit 1
fi

mkdir -p "$REPORTS_DIR"
STAMP="$(date +%Y-%m-%d-%H%M)"
OUT_PATH="$REPORTS_DIR/$STAMP-$SLUG.md"

cp "$TEMPLATE_PATH" "$OUT_PATH"

# Pre-fill basic metadata to reduce manual edits.
TODAY="$(date +%Y-%m-%d)"
BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
sed -i \
  -e "s/- Date: \`YYYY-MM-DD\`/- Date: \`$TODAY\`/" \
  -e "s/- Branch:/- Branch: \`$BRANCH\`/" \
  "$OUT_PATH"

echo "Created report: $OUT_PATH"
