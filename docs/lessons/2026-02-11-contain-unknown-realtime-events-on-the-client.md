---
lesson_id: lesson-2026-02-11-contain-unknown-realtime-events-on-the-client
severity: HIGH
domains:
  - frontend
  - websocket
source_report: docs/reports/2026-02-11-2144-onboarding-crash-review.md
status: active
detection: "rg -n \"room_message|unknown conversation|invalidate\" frontend/src"
---

# Lesson: Contain unknown realtime events on the client

## Problem
Processing unknown room events as normal conversation updates.

## Trigger
Processing unknown room events as normal conversation updates.

## Fix
Drop unknown-room events and throttle invalidation to prevent UI pressure loops.

## Guardrail
Use detection pattern in review/automation: `rg -n "room_message|unknown conversation|invalidate" frontend/src`

## References
- Source report: `docs/reports/2026-02-11-2144-onboarding-crash-review.md`
