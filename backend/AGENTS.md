# Backend AGENTS

Follow `/AGENTS.md` first.

## Scope

Backend-only implementation guidance for work in `backend/`.

## Runtime + Tooling

- Docker-first for backend flows.
- Prefer Make targets from repo root.
- Host Go may exist, but do not assume it.

## Backend Rules

- Follow existing layering (`handler -> service -> repository`) where present.
- Never ignore errors (`_ = err` / ignored `.Error` paths).
- Validate input at boundaries and enforce authz for user-owned resources.
- Keep status codes and response envelopes stable unless requested.
- Keep DB and Redis changes explicit, bounded, and testable.

## Validation

Run relevant checks before completion:

- `make fmt`
- `make lint`
- `make test-backend`
- `make test-backend-integration` (when integration paths are touched)
