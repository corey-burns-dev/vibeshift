# Claude Instructions (Sanctum)

This file contains the **must-follow** rules Claude should apply at all times.
For full repo rules, see `/AI.md`. For frontend-specific rules, see `/frontend/AI.md`.

## Non-negotiables
- Extend existing patterns; avoid architecture rewrites.
- Prefer small, reviewable diffs.
- Preserve behavior unless explicitly asked to change behavior.
- Keep docs and commands accurate to this repo.

## Environment + tooling assumptions
- **Docker-first** workflow for backend + infra tasks.
- Do **not** assume the host has the Go toolchain installed.
- Default shell assumptions may be Fish locally, but scripts should remain POSIX-sh compatible.
- Frontend package manager/runtime: **Bun**
- Frontend lint/format: **Biome**
- Backend lint: **golangci-lint**

## Command safety
### Backend
- Prefer Make targets: `make dev`, `make test-backend`, `make fmt`, `make lint`, `make swagger`, `make openapi-check`.
- If direct Go execution is required, run it inside containers (`docker compose exec` / `docker compose run --rm`).

### Frontend
- Run Bun commands from `frontend/` (or via Make targets).
- Prefer: `make test-frontend`, `make fmt-frontend`, `make lint-frontend`.

## Workflow expectations
- Read existing patterns before editing.
- Always report: what changed, how to validate, and followups.
- Split substantial work into small atomic commits.
- For substantial tasks, add a report in `docs/reports/` named:
  `YYYY-MM-DD-HHMM-<slug>.md` using `docs/reports/REPORT_TEMPLATE.md`.

## Where to look next
- Repo-wide rules: `/AI.md`
- Frontend rules: `/frontend/AI.md`
- Contributor workflow: `/CONTRIBUTING.md`
- Make targets (source of truth): `/Makefile`
