# AGENTS.md — AI Operating Manual

This repository is optimized for use with AI coding agents
(Claude, Copilot, Codex, Gemini, etc).

This file defines:

- How agents should behave
- What commands they should run
- What they must NOT assume
- How changes should be structured

For detailed engineering rules, see:

- `/AI.md` (repo-wide standards)
- `/CLAUDE.md` (Claude-specific must-follow rules)
- `/frontend/AI.md` (frontend conventions)
- `/CONTRIBUTING.md` (human workflow)

---

# Core Principles (All Agents)

1. Prefer extending existing patterns over introducing new abstractions.
2. Keep diffs small and reviewable.
3. Do not rewrite architecture unless explicitly requested.
4. Preserve behavior unless explicitly asked to change it.
5. Always explain:
   - What changed
   - Why
   - How to validate
   - Any followups

---

# Environment Model

## Backend

- Go project
- Docker-first workflow
- Prefer Make targets
- Do NOT assume Go is installed on host

## Frontend

- React + TanStack Query
- Bun runtime
- Biome for lint/format
- Tailwind (+ shadcn where present)

---

# Source of Truth: Makefile

Agents should prefer Make targets over ad-hoc commands.

## Backend Commands

| Task                | Command              |
| ------------------- | -------------------- |
| Dev                 | `make dev`           |
| Backend only        | `make dev-backend`   |
| Test                | `make test-backend`  |
| Format              | `make fmt`           |
| Lint                | `make lint`          |
| Swagger             | `make swagger`       |
| OpenAPI drift check | `make openapi-check` |

If direct Go execution is required, run it inside containers.

---

## Frontend Commands

| Task   | Command                                             |
| ------ | --------------------------------------------------- |
| Dev    | `make dev-frontend` or `cd frontend && bun run dev` |
| Test   | `make test-frontend`                                |
| Format | `make fmt-frontend`                                 |
| Lint   | `make lint-frontend`                                |
| Build  | `cd frontend && bun run build`                      |

Do not use npm/yarn unless explicitly requested.
This repo uses Bun.

---

# Change Discipline

When making changes:

- Update related types across layers (backend ↔ frontend).
- If API changes:
  - Update swagger/OpenAPI.
  - Update frontend API client/types.
- If formatting modifies files:
  - Re-stage modified files before commit.

---

# Commit Expectations

Commits should be:

- Atomic
- Clearly described
- Behaviorally scoped

For substantial work:

- Add a report in `docs/reports/`
- Use: `YYYY-MM-DD-HHMM-topic.md`
- Follow `docs/reports/REPORT_TEMPLATE.md`

---

# Safety Rules

Agents must NOT:

- Read `.env` files
- Modify secrets
- Introduce new infrastructure without instruction
- Add new dependencies without justification

---

# PR Workflow

1. Create branch.
2. Make atomic changes.
3. Run:
   - `make fmt`
   - `make lint`
   - `make test-backend`
   - `make test-frontend`
4. Open PR.
5. AI review is first pass.
6. Human review is final authority.

---

# How To Review

When reviewing a PR:

Focus on:

- Behavioral regressions
- Security issues
- Type drift
- API contract changes
- Performance regressions

Avoid:

- Style nitpicks (handled by formatters)
- Rewriting stable patterns

---

# Folder-Specific Guidance

- `/backend` → see `/backend/CLAUDE.md`
- `/frontend` → see `/frontend/CLAUDE.md`

Agents should load those files when working in those directories.

---

# Philosophy

AI is a productivity multiplier, not an architect.

Prefer:

- Predictable
- Boring
- Observable
- Testable

Over:

- Clever
- Magical
- Over-abstracted
