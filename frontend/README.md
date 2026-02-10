# Frontend (Vite + React + TanStack Query)

Frontend application for Sanctum, built with React + TypeScript + Vite.

## Quick Start

From repo root:

```bash
cd frontend
bun install
bun run dev
```

Dev server default: `http://localhost:5173`

## Useful Commands

```bash
bun run build
bun run test
bun run test:run
bun run test:e2e:smoke
bun run test:e2e
bun run lint
bun run format
```

## Playwright E2E

Install browser dependencies once:

```bash
bun run test:e2e:install
```

Run Sanctum smoke tests (fast PR subset):

```bash
bun run test:e2e:smoke
```

Run full E2E suite:

```bash
bun run test:e2e
```

### E2E Environment Variables

- `PLAYWRIGHT_BASE_URL` (default `http://localhost:5173`)
- `PLAYWRIGHT_API_URL` (default `http://localhost:8375/api`)

For admin bootstrap in E2E global setup (DB promote-admin update), set either
`PG*` vars or `DB_*` vars:

- `DB_HOST` / `PGHOST`
- `DB_PORT` / `PGPORT`
- `DB_USER` / `PGUSER`
- `DB_PASSWORD` / `PGPASSWORD`
- `DB_NAME` / `PGDATABASE`

For repo-wide rules and constraints, see `/AI.md`.
