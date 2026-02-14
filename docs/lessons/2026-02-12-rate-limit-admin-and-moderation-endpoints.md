---
lesson_id: lesson-2026-02-12-rate-limit-admin-and-moderation-endpoints
severity: HIGH
domains:
  - backend
  - auth
source_report: docs/reports/2026-02-12-2250-deep-production-review.md
status: active
detection: "rg -n \"Group\\(\\\"/admin\\\"|Report(User|Post|Message)\" backend/internal/server"
---

# Lesson: Rate limit admin and moderation endpoints

## Problem
Sensitive or high-impact routes without endpoint-specific throttling.

## Trigger
Sensitive or high-impact routes without endpoint-specific throttling.

## Fix
Apply explicit Redis-backed limits to admin/moderation/report creation paths.

## Guardrail
Use detection pattern in review/automation: `rg -n "Group\(\"/admin\"|Report(User|Post|Message)" backend/internal/server`

## References
- Source report: `docs/reports/2026-02-12-2250-deep-production-review.md`
