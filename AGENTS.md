# AGENTS.md - Sanctum Canonical Agent Rules

This is the canonical, always-read instruction file for AI agents in this repository.

## Mission

Ship safe, reviewable changes quickly while preserving behavior unless explicitly asked to change behavior.

## Project Snapshot

- Product: Social platform for hobbies and communities
- Backend: Go + Fiber + PostgreSQL + Redis
- Frontend: React + TypeScript + TanStack Query + Tailwind + Bun
- Runtime: Docker Compose first for backend/infra workflows

## Core Non-Negotiables

1. Extend existing patterns; avoid architecture rewrites unless requested.
2. Keep diffs small, focused, and reviewable.
3. Preserve API contracts and behavior unless explicitly changed in scope.
4. Never ignore errors in Go; never panic in normal runtime paths.
5. Do not read secrets from `.env` or hardcode credentials.
6. Prefer Make targets over ad-hoc commands.
7. For substantial work, add a report in `docs/reports/` using the template.

## Safety Rails

- Auth boundaries: enforce authn/authz for user-owned resources.
- Ownership checks: never trust client ownership claims.
- Migrations: schema changes must be explicit and rollback-aware.
- Abuse controls: consider rate limits and backpressure for chat/realtime paths.
- Logging: never log tokens, credentials, or secret material.
- Secrets: no hardcoded passwords, API keys, or JWT secrets.

## Command Model

### Backend

Prefer:

- `make dev`
- `make test-backend`
- `make test-backend-integration`
- `make fmt`
- `make lint`
- `make swagger`
- `make openapi-check`

If direct Go execution is required, run in containerized context when possible.

### Frontend

Prefer:

- `make dev-frontend`
- `make test-frontend`
- `make fmt-frontend`
- `make lint-frontend`
- `cd frontend && bun run type-check`

Use Bun, not npm/yarn, unless task explicitly requires otherwise.

## Scope Routing

Read these only when relevant:

- Backend work: `backend/AGENTS.md`
- Frontend work: `frontend/AGENTS.md`
- Pattern memory: `docs/context/`
- Incident memory: `docs/lessons/INDEX.md`
- Architecture decisions: `docs/decisions/`

## Doc Budget Rule

If you need more than two `docs/context/*.md` files to proceed, pause and ask what decision is missing before reading further.

## Reporting

For substantial tasks, create a report:

- Path: `docs/reports/`
- Naming (new reports): `YYYY-MM-DD-HHMM-short-slug.md`
- Template: `docs/reports/REPORT_TEMPLATE.md`

## Change Discipline

- Keep unrelated changes out of the same diff.
- Update docs when behavior or workflows change.
- If API changes, sync OpenAPI and frontend API consumers.
- Validate with lint/tests appropriate to touched surface.

## Compatibility Surfaces

- Claude overlay: `CLAUDE.md`
- Copilot overlay: `.github/copilot-instructions.md`
- GitHub custom agents: `.github/agents/*.md`
- Legacy compatibility pointer: `AI.md`
