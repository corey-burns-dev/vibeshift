# Frontend AGENTS

Follow `/AGENTS.md` first.

## Scope

Frontend-only guidance for work in `frontend/`.

## Frontend Rules

- Preserve existing React + TanStack Query patterns.
- Keep HTTP details in API layer/hooks, not in render paths.
- Use stable query keys and explicit invalidation strategy.
- Preserve accessibility basics (keyboard flow, labels, focus-visible).
- Use Bun + Biome workflows.

## Validation

Run relevant checks before completion:

- `make fmt-frontend`
- `make lint-frontend`
- `make test-frontend`
- `cd frontend && bun run type-check`
