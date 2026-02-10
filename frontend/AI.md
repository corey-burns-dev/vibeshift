# Frontend AI Guide

See `/AI.md` for global agent and repo rules.

## Scope

This file covers frontend-only conventions for work in `frontend/`.

## Structure

- `src/api/`: API client and request/response types.
- `src/hooks/`: TanStack Query hooks and feature hooks.
- `src/components/`: reusable UI pieces (`ui/` for shared primitives).
- `src/pages/`: route-level screens.
- `src/lib/`: shared utilities and validation helpers.
- `src/styles/`: global styling.

## API and Hook Patterns

- Keep HTTP details in `src/api/client.ts`.
- Use typed interfaces from `src/api/types.ts`.
- Prefer hooks in `src/hooks/` for server interactions.
- Do not fetch directly in page/component render logic when a shared hook pattern exists.

## TanStack Query Conventions

- Use stable query keys and co-locate keys with hooks.
- Mutations must define explicit invalidation behavior.
- Prefer optimistic updates only when rollback behavior is defined.
- Avoid duplicating server state into local component state unless necessary for UX.

## UI and Layout Conventions

- Preserve existing Tailwind + Radix-style component patterns.
- Keep components focused and composable.
- Preserve accessibility basics: keyboard access, labels/aria-labels, visible focus.

## Frontend Commands

Run from `frontend/`:

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run test`
- `bun run lint`
- `bun run format`
