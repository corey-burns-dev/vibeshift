# Task Report: AI-Agent Docs Restructure v3 Implementation

## Metadata

- Date: `2026-02-14`
- Branch: `fixing-md-structure`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Canonical agent instruction surface, memory layer, docs governance automation, stale-reference cleanup`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["docs", "infra"],
  "Lessons": [
    {
      "title": "Use one canonical instruction file with compatibility shims",
      "severity": "HIGH",
      "anti_pattern": "Multiple partially-overlapping instruction files cause discovery tax and conflicting guidance.",
      "detection": "rg -n '/AI.md|/AGENTS.md|/CLAUDE.md' AGENTS.md CLAUDE.md docs/ backend frontend .github",
      "prevention": "Make AGENTS.md canonical, keep overlays/shims thin, and route scoped guidance via backend/frontend AGENTS files."
    },
    {
      "title": "Report contracts should be machine-validated in CI",
      "severity": "HIGH",
      "anti_pattern": "Freeform reports without structured signals prevent deterministic lesson/context extraction.",
      "detection": "python3 scripts/agent_memory.py validate --report docs/reports/<file> --require-structured",
      "prevention": "Require structured signals in report template and enforce schema + naming in report-required workflow."
    },
    {
      "title": "Keep duplicated agent templates in sync automatically",
      "severity": "MEDIUM",
      "anti_pattern": "Mirrored template trees drift over time and silently diverge.",
      "detection": "./scripts/verify_agent_template_sync.sh",
      "prevention": "Treat .github/agents as canonical and mirror into docs/agents/templates with sync/verify tooling and CI checks."
    }
  ]
}
```

## Summary

- Requested: implement the full AI-agent documentation restructure v3 plan end-to-end.
- Delivered: canonical instruction model (`AGENTS.md`), compatibility overlays/shims, scoped backend/frontend guidance, template sync governance, report schema + CI validation, lessons/context/decisions memory layer, and stale docs path cleanup.

## Changes Made

- Instruction surface normalization:
  - Canonicalized `AGENTS.md` and converted `CLAUDE.md` into a thin overlay.
  - Added scoped files: `backend/AGENTS.md`, `frontend/AGENTS.md`.
  - Updated compatibility shims: `AI.md`, `ANTIGRAVITY.md`, `.cursorrules`, `.cursor/rules/00-repo-rules.mdc`, `frontend/AI.md`.
  - Added Copilot/GitHub instruction surfaces: `.github/copilot-instructions.md`, `.github/instructions/backend.instructions.md`, `.github/instructions/frontend.instructions.md`.
- Template drift control:
  - Set `.github/agents/*.md` as canonical.
  - Added `scripts/sync_agent_templates.sh` and `scripts/verify_agent_template_sync.sh`.
  - Synced mirror at `docs/agents/templates/*.md`.
  - Added CI docs job enforcing sync.
- Memory layer:
  - Added context docs:
    - `docs/context/backend-patterns.md`
    - `docs/context/frontend-patterns.md`
    - `docs/context/auth-and-security.md`
    - `docs/context/known-issues.md`
  - Added decisions:
    - `docs/decisions/0001-auth-ticket-flow.md`
    - `docs/decisions/0002-websocket-handshake.md`
  - Added lessons system:
    - `docs/lessons/TEMPLATE.md`
    - `docs/lessons/INDEX.md`
    - Backfilled lessons from the targeted 5 reports.
  - Added automation CLI: `scripts/agent_memory.py` (`backfill`, `update`, `validate`).
- Governance automation:
  - Updated `docs/reports/REPORT_TEMPLATE.md` with required structured signals block.
  - Updated `scripts/new_report.sh` metadata formatting.
  - Enhanced `.github/workflows/report-required.yml` with:
    - report filename convention enforcement
    - structured-signal validation for newly added reports
  - Added docs link checker: `scripts/check_doc_links.sh`.
  - Added Make targets:
    - `ai-memory-backfill`
    - `ai-memory-update`
    - `ai-memory-validate`
    - `ai-docs-verify`
    - `openapi-check`
- Hygiene fixes:
  - Updated stale runbook references to `docs/operations/runbooks/*`.
  - Converted `docs/runbooks/ROLLBACK_RUNBOOK.md` to compatibility pointer.
  - Rewrote `docs/features/review/instructions.md` into deterministic guidance.
  - Updated AI rule references in active docs to `AGENTS.md`.
  - Added `docs/agents/metrics.md` with targets + monthly maintenance routine.

## Validation

- Commands run:
  - `./scripts/verify_agent_template_sync.sh`
  - `python3 scripts/agent_memory.py backfill --reports-dir docs/reports --lessons-dir docs/lessons`
  - `python3 scripts/agent_memory.py validate`
  - `python3 scripts/agent_memory.py validate --report docs/reports/REPORT_TEMPLATE.md --require-structured`
  - `./scripts/check_doc_links.sh`
  - `bash -n scripts/new_report.sh scripts/check_doc_links.sh scripts/sync_agent_templates.sh scripts/verify_agent_template_sync.sh`
  - `make ai-docs-verify`
- Test results:
  - Docs/memory/template governance checks passed.
  - No runtime application test suites were run (changes are docs/workflow/scripts oriented).
- Manual verification:
  - Verified generated lesson index and known-issues file content.
  - Verified CI workflow updates include docs and report schema enforcement paths.

## Risks and Regressions

- Known risks:
  - Existing historical reports remain non-standard and are intentionally not retrofitted in this pass.
- Potential regressions:
  - New report-required checks may initially fail PRs that use old report naming/schema habits.
- Mitigations:
  - `scripts/new_report.sh` now produces compliant report skeletons.
  - `docs/reports/REPORT_TEMPLATE.md` includes explicit machine-readable requirements.

## Follow-ups

- Remaining work:
  - Gradually normalize historical report corpus if desired (optional future cleanup).
  - Add a lightweight monthly metrics log entry process under `docs/agents/metrics.md`.
- Recommended next steps:
  - Run full CI on the branch and fix any workflow-level edge-case failures.
  - Use `make ai-memory-update REPORT=...` on the next substantial report to exercise the full pipeline.

## Rollback Notes

- Revert this change set commit(s) and rerun:
  - `scripts/sync_agent_templates.sh` (if template mirror becomes stale after rollback)
  - `make ai-docs-verify`
- Canonical rollback guidance remains in:
  - `docs/operations/runbooks/rollback-runbook.md`
