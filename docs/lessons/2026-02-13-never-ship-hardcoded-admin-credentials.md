---
lesson_id: lesson-2026-02-13-never-ship-hardcoded-admin-credentials
severity: CRITICAL
domains:
  - backend
  - auth
  - infra
source_report: docs/reports/production-review-2026-02-13.md
status: active
detection: "rg -n \"DevRoot123|password\\s*=\\s*\\\"\" backend/internal"
---

# Lesson: Never ship hardcoded admin credentials

## Problem
Fallback admin password values in runtime bootstrap logic.

## Trigger
Fallback admin password values in runtime bootstrap logic.

## Fix
Require explicit env/config value or fail startup for privileged credentials.

## Guardrail
Use detection pattern in review/automation: `rg -n "DevRoot123|password\s*=\s*\"" backend/internal`

## References
- Source report: `docs/reports/production-review-2026-02-13.md`
