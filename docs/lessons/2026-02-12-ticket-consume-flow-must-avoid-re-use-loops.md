---
lesson_id: lesson-2026-02-12-ticket-consume-flow-must-avoid-re-use-loops
severity: HIGH
domains:
  - backend
  - auth
  - websocket
source_report: docs/reports/2026-02-12-websocket-ticket-loop-fix.md
status: active
detection: "rg -n \"ticket|Consume|Validate\" backend/internal/server"
---

# Lesson: Ticket consume flow must avoid re-use loops

## Problem
Racey ticket validation/consumption causing reconnect loops.

## Trigger
Racey ticket validation/consumption causing reconnect loops.

## Fix
Consume tickets atomically with clear one-time semantics and reconnect-safe handling.

## Guardrail
Use detection pattern in review/automation: `rg -n "ticket|Consume|Validate" backend/internal/server`

## References
- Source report: `docs/reports/2026-02-12-websocket-ticket-loop-fix.md`
