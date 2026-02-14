# Backend (Go) — Claude Notes

Follow `/CLAUDE.md` + `/AGENTS.md` first.

## How to run
- Prefer Docker-first and Make targets.
- Useful commands:
  - `make dev-backend` / `make dev`
  - `make test-backend`
  - `make fmt` and `make lint`
  - `make swagger` and `make openapi-check`

## Rules of thumb
- Don’t introduce new frameworks unless explicitly requested.
- Keep API changes reflected in swagger/OpenAPI outputs.
- If endpoints/types change, ensure frontend API client/types/hooks are updated accordingly.
