# Frontend (React) — Claude Notes

Follow `/CLAUDE.md` + `/AI.md` first. Frontend conventions live in `/frontend/AI.md`.

## How to run
- From `frontend/`:
  - `bun run dev`
  - `bun run build`
  - `bun run test`
  - `bun run lint`
  - `bun run format`
- Or via Make:
  - `make test-frontend`
  - `make fmt-frontend`
  - `make lint-frontend`

## Rules of thumb
- Follow existing TanStack Query + hooks patterns in `/frontend/AI.md`.
- Prefer small UI diffs; keep styling consistent with Tailwind/shadcn usage in this repo.
