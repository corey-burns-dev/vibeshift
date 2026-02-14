#!/usr/bin/env bash
# Basic validation script to show post counts per sanctum and type.
# Expects DATABASE_URL or connection via psql env vars.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Please set DATABASE_URL (e.g. postgres://user:pass@host:5432/db)"
  exit 1
fi

psql "$DATABASE_URL" -c "\
SELECT s.slug, p.post_type, count(*)
FROM posts p
JOIN sanctums s ON s.id = p.sanctum_id
GROUP BY s.slug, p.post_type
ORDER BY s.slug, p.post_type;"
