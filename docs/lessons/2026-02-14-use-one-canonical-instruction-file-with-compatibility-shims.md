---
lesson_id: lesson-2026-02-14-use-one-canonical-instruction-file-with-compatibility-shims
severity: HIGH
domains:
  - docs
  - infra
source_report: docs/reports/2026-02-14-1224-ai-agent-docs-restructure-v3.md
status: active
detection: "rg -n '/AI.md|/AGENTS.md|/CLAUDE.md' AGENTS.md CLAUDE.md docs/ backend frontend .github"
---

# Lesson: Use one canonical instruction file with compatibility shims

## Problem
Multiple partially-overlapping instruction files cause discovery tax and conflicting guidance.

## Trigger
Multiple partially-overlapping instruction files cause discovery tax and conflicting guidance.

## Fix
Make AGENTS.md canonical, keep overlays/shims thin, and route scoped guidance via backend/frontend AGENTS files.

## Guardrail
Use detection pattern in review/automation: `rg -n '/AI.md|/AGENTS.md|/CLAUDE.md' AGENTS.md CLAUDE.md docs/ backend frontend .github`

## References
- Source report: `docs/reports/2026-02-14-1224-ai-agent-docs-restructure-v3.md`
