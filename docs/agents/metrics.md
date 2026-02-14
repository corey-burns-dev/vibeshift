# Agent Documentation Metrics

Track these metrics monthly to confirm the instruction system stays effective.

## Targets

- Context-load token budget: <= 3,000 tokens before implementation starts.
- Repeated incident rate: < 5% of issues repeat within 30 days.
- Agent ramp-up time: <= 2 minutes to first meaningful code action.
- Report compliance: 100% of new substantial-task reports pass schema + naming checks.

## Measurement Inputs

- `docs/reports/*.md` (new reports only for compliance baseline)
- `docs/lessons/INDEX.md`
- `docs/context/known-issues.md`
- PR workflow outcomes from CI checks

## Monthly Maintenance Routine

1. Merge or deduplicate overlapping lessons.
2. Archive stale known issues (resolved/expired > 45 days unless pinned).
3. Refresh agent templates with top recurring anti-patterns.
4. Validate docs and template sync:
   - `make ai-docs-verify`
5. Recalculate and log metric values in this file or a monthly report.
