#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-main}"
OUT_FILE="${2:-PR_BODY.md}"

# Basic signals
DIFFSTAT="$(git diff --stat "$BASE_BRANCH"...HEAD)"
COMMITS="$(git log --pretty=format:"- %s" "$BASE_BRANCH"..HEAD)"
FILES="$(git diff --name-only "$BASE_BRANCH"...HEAD)"

# Heuristics
TYPE_BUG="false"
TYPE_FEATURE="false"
TYPE_REFACTOR="false"
TYPE_CHORE="false"

if echo "$COMMITS $FILES" | grep -Eqi '\bfix\b|bug|hotfix'; then TYPE_BUG="true"; fi
if echo "$COMMITS $FILES" | grep -Eqi '\bfeat\b|feature|add|implement'; then TYPE_FEATURE="true"; fi
if echo "$COMMITS $FILES" | grep -Eqi '\brefactor\b|cleanup|restructure'; then TYPE_REFACTOR="true"; fi
if echo "$COMMITS $FILES" | grep -Eqi '\bchore\b|ci\b|docs\b|readme|deps|bump'; then TYPE_CHORE="true"; fi

# Pick one (priority order)
TYPE_LINE="- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Docs / CI / Chore"
if [ "$TYPE_BUG" = "true" ]; then
  TYPE_LINE="$(echo "$TYPE_LINE" | sed 's/- \[ \] Bug fix/- [x] Bug fix/')"
elif [ "$TYPE_FEATURE" = "true" ]; then
  TYPE_LINE="$(echo "$TYPE_LINE" | sed 's/- \[ \] Feature/- [x] Feature/')"
elif [ "$TYPE_REFACTOR" = "true" ]; then
  TYPE_LINE="$(echo "$TYPE_LINE" | sed 's/- \[ \] Refactor/- [x] Refactor/')"
else
  TYPE_LINE="$(echo "$TYPE_LINE" | sed 's/- \[ \] Docs \/ CI \/ Chore/- [x] Docs \/ CI \/ Chore/')"
fi

MIGRATION="false"
if echo "$FILES" | grep -Eqi 'migrations/|migration|schema'; then MIGRATION="true"; fi

# Don’t auto-claim tests/lint passed unless you actually run them in the same script.
LINT_PASSED="false"
TESTS_PASSED="false"

# Write output
cat > "$OUT_FILE" <<EOF
# What / Why

## Type

$TYPE_LINE

## Changes

**Summary (auto-generated):**
- Commits:
$COMMITS

**Diffstat:**
\`\`\`
$DIFFSTAT
\`\`\`

## How to Test

1. Pull branch and run:
   - \`make fmt\` (or \`make fmt-frontend\`)
   - \`make lint\` (or \`make lint-frontend\`)
   - \`make test\` (or your app’s test commands)
2. Manually verify any UI/API paths touched by the changed files.

## Checklist

- [ ] Lint passes
- [ ] Tests pass
- [ ] No behavior changes during refactor
- [ ] Screenshots/logs attached if applicable
- [ ] Migration required $( [ "$MIGRATION" = "true" ] && echo "(likely: yes)" || echo "(likely: no)" )
- [ ] Reviewed my own diff
EOF

echo "Wrote $OUT_FILE"
