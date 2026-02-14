---
lesson_id: lesson-2026-02-12-handshake-auth-must-be-explicit-and-ticket-based
severity: HIGH
domains:
  - backend
  - frontend
  - auth
  - websocket
source_report: docs/reports/2026-02-12-websocket-handshake-fix.md
status: active
detection: "rg -n \"ws|ticket|handshake\" backend/internal/server frontend/src"
---

# Lesson: Handshake auth must be explicit and ticket-based

## Problem
Implicit or stale auth assumptions during websocket connect.

## Trigger
Implicit or stale auth assumptions during websocket connect.

## Fix
Use short-lived ticket exchange and validate ticket consume path deterministically.

## Guardrail
Use detection pattern in review/automation: `rg -n "ws|ticket|handshake" backend/internal/server frontend/src`

## References
- Source report: `docs/reports/2026-02-12-websocket-handshake-fix.md`
