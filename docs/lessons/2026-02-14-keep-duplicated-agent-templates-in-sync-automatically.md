---
lesson_id: lesson-2026-02-14-keep-duplicated-agent-templates-in-sync-automatically
severity: MEDIUM
domains:
  - docs
  - infra
source_report: docs/reports/2026-02-14-1224-ai-agent-docs-restructure-v3.md
status: active
detection: "./scripts/verify_agent_template_sync.sh"
---

# Lesson: Keep duplicated agent templates in sync automatically

## Problem
Mirrored template trees drift over time and silently diverge.

## Trigger
Mirrored template trees drift over time and silently diverge.

## Fix
Treat .github/agents as canonical and mirror into docs/agents/templates with sync/verify tooling and CI checks.

## Guardrail
Use detection pattern in review/automation: `./scripts/verify_agent_template_sync.sh`

## References
- Source report: `docs/reports/2026-02-14-1224-ai-agent-docs-restructure-v3.md`
