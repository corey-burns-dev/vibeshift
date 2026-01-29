# Vibeshift Frontend Context

## Tech Stack

- **Framework:** React 19
- **Build Tool:** Vite 7
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4, Radix UI (Headless), Lucide React (Icons), `tailwindcss-animate`.
- **State Management:** TanStack Query (React Query) v5.
- **Routing:** React Router v7.
- **Forms:** React Hook Form + Zod.
- **Testing:** Vitest + Testing Library.
- **Runtime:** Bun (implied by `bun.lock`, `package.json` scripts).

## Architecture

- **Structure:**
  - `src/api/`: API client definition (`client.ts`) and types.
  - `src/components/`: Reusable UI components (`ui/` for shadcn-like primitives).
  - `src/hooks/`: Custom hooks (e.g., `useAuth`, `useChat`).
  - `src/pages/`: Route components.
  - `src/lib/`: Utilities (`utils.ts`, `validations.ts`).
- **Entry Point:** `src/main.tsx`.

## Configuration

- **Vite Config:** `vite.config.ts`
  - Proxies `/health` and `/ping` to backend.
  - Port: 5173 (default).
  - Alias: `@` -> `/src`.
- **Env:** `VITE_API_URL` (defaults to `http://localhost:8375/api`).

## Development

- **Run:** `bun run dev` (or `npm run dev` / `pnpm dev`).
- **Lint/Format:** Biome (`bun biome check .`).
- **Test:** `vitest`.
