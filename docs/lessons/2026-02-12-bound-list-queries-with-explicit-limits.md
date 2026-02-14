---
lesson_id: lesson-2026-02-12-bound-list-queries-with-explicit-limits
severity: HIGH
domains:
  - backend
  - db
source_report: docs/reports/2026-02-12-2250-deep-production-review.md
status: active
detection: "rg -n \"ListBy|GetFriends|GetPending\" backend/internal/repository"
---

# Lesson: Bound list queries with explicit limits

## Problem
List endpoints returning unbounded datasets.

## Trigger
List endpoints returning unbounded datasets.

## Fix
Enforce max pagination limits and bounded DB query limits.

## Guardrail
Use detection pattern in review/automation: `rg -n "ListBy|GetFriends|GetPending" backend/internal/repository`

## References
- Source report: `docs/reports/2026-02-12-2250-deep-production-review.md`
