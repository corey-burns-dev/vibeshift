---
lesson_id: lesson-2026-02-13-never-ignore-gorm-error-results
severity: CRITICAL
domains:
  - backend
  - db
source_report: docs/reports/production-review-2026-02-13.md
status: active
detection: "rg -n \"_ = .*\\\\.Error\" backend/internal backend/cmd"
---

# Lesson: Never ignore GORM .Error results

## Problem
Discarding GORM operation errors with `_ = ...Error`.

## Trigger
Discarding GORM operation errors with `_ = ...Error`.

## Fix
Always check and handle GORM errors or document explicit safe ignore rationale.

## Guardrail
Use detection pattern in review/automation: `rg -n "_ = .*\\.Error" backend/internal backend/cmd`

## References
- Source report: `docs/reports/production-review-2026-02-13.md`
