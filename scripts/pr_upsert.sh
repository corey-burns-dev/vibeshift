#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-main}"
TITLE="${2:-"$(git log -1 --pretty=%s)"}"

# Generate body
"$(dirname "$0")/gen_pr_body.sh" "$BASE_BRANCH" PR_BODY.md

# Requires GitHub CLI: https://cli.github.com/
# Auth once: gh auth login

# Check if a PR already exists for this branch
PR_NUMBER="$(gh pr view --json number -q .number 2>/dev/null || true)"

if [ -z "$PR_NUMBER" ]; then
  gh pr create --base "$BASE_BRANCH" --title "$TITLE" --body-file PR_BODY.md
  echo "Created PR"
else
  gh pr edit "$PR_NUMBER" --body-file PR_BODY.md
  echo "Updated PR #$PR_NUMBER body"
fi
