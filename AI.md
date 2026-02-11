# AI and Repository Rules

This file is the single source of truth for repo-wide AI and contributor rules.

## Scope

- Applies to all repository work unless a task explicitly narrows scope.
- Frontend-specific details live in `frontend/AI.md`.

## Core Principles

- Extend existing patterns; avoid architecture rewrites.
- Prefer small, reviewable diffs.
- Preserve behavior unless the task explicitly asks for behavior change.
- Keep docs and commands accurate to this repository.

## Environment and Tooling Assumptions

- Docker-first workflow is the default for backend and infrastructure tasks.
- Default interactive shell for local commands is Fish (`/bin/fish`).
- Some agent environments do not have Go installed on host.
- Frontend runtime and package manager is Bun.
- Frontend lint/format is Biome.
- Backend lint is `golangci-lint`.

## Stack Boundaries

### Backend

- Go + Fiber API in `backend/`.
- PostgreSQL for primary persistence.
- Redis for caching/pubsub/rate limiting.

### Frontend

- React + TypeScript + Vite in `frontend/`.
- TanStack Query for server state.
- Tailwind CSS and Radix-style component patterns.

## Command Safety for Agents

### Backend command rule

- Do not assume host Go toolchain availability.
- Prefer Makefile targets (`make dev`, `make test`, `make fmt`, `make lint`, `make seed`, `make deps-*`).
- If direct Go execution is needed, run inside containers via `docker compose exec` or `docker compose run --rm`.

### Frontend command rule

- Use Bun commands from `frontend/`.
- Prefer `bun run dev`, `bun run build`, `bun run test`, `bun run lint`, `bun run format`.

## Engineering Conventions

### Changes and scope

- Do not change CI/build/runtime behavior unless explicitly requested.
- Do not add dependencies unless needed and justified.
- Keep edits focused; avoid unrelated churn.

### API and behavior safety

- Preserve routes, status codes, and response shapes unless explicitly requested.
- Keep refactors behavior-preserving.

### Error handling

- Do not ignore errors in Go.
- Do not use panic in normal runtime paths.

### Security and auth

- Do not trust client ownership claims.
- Enforce authz on user-owned resources.
- Do not log secrets or tokens.

## Agent Workflow Expectations

- Read existing implementation patterns before editing.
- State what changed, how to validate, and any followups.
- For larger tasks, split work into small atomic commits.
- For substantial tasks, add a report in `docs/reports/` named `YYYY-MM-DD-HHMM-<slug>.md`.
- Use `docs/reports/REPORT_TEMPLATE.md` for report structure and include validation details.

## Related Docs

- Frontend-specific guidance: `frontend/AI.md`
- Backend testing guidance: `backend/TESTING.md`
- Redis canonical doc: `backend/docs/REDIS_BEST_PRACTICES.md`
- Historical reports: `docs/reports/`
