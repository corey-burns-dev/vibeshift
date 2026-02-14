---
lesson_id: lesson-2026-02-14-report-contracts-should-be-machine-validated-in-ci
severity: HIGH
domains:
  - docs
  - infra
source_report: docs/reports/2026-02-14-1224-ai-agent-docs-restructure-v3.md
status: active
detection: "python3 scripts/agent_memory.py validate --report docs/reports/<file> --require-structured"
---

# Lesson: Report contracts should be machine-validated in CI

## Problem
Freeform reports without structured signals prevent deterministic lesson/context extraction.

## Trigger
Freeform reports without structured signals prevent deterministic lesson/context extraction.

## Fix
Require structured signals in report template and enforce schema + naming in report-required workflow.

## Guardrail
Use detection pattern in review/automation: `python3 scripts/agent_memory.py validate --report docs/reports/<file> --require-structured`

## References
- Source report: `docs/reports/2026-02-14-1224-ai-agent-docs-restructure-v3.md`
