---
lesson_id: lesson-2026-02-12-add-panic-recovery-for-background-subscribers
severity: HIGH
domains:
  - backend
  - websocket
  - infra
source_report: docs/reports/2026-02-12-2250-deep-production-review.md
status: active
detection: "rg -n \"go func\\(\\).*for msg := range\" backend/internal/notifications"
---

# Lesson: Add panic recovery for background subscribers

## Problem
Background subscriber goroutines without panic containment.

## Trigger
Background subscriber goroutines without panic containment.

## Fix
Wrap callback execution with recover and log critical panic context.

## Guardrail
Use detection pattern in review/automation: `rg -n "go func\(\).*for msg := range" backend/internal/notifications`

## References
- Source report: `docs/reports/2026-02-12-2250-deep-production-review.md`
