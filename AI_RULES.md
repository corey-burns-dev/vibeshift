# AI Coding Rules for VibeShift

## 1. Tech Stack Boundaries

- **Frontend Package Manager:** Bun (`bun install`, `bun run`)
- **Backend Language:** Go (Fiber v2 Framework)
- **Frontend Framework:** React v19 + Vite
- **Styling:** Tailwind CSS v4 (CSS-first configuration, no `tailwind.config.js`)
- **Linting/Formatting:** Biome (Do NOT suggest ESLint or Prettier)
- **State Management:** - Server State: TanStack Query (v5)
  - Client State: Zustand
- **Routing:** React Router v7
- **Forms:** React Hook Form + Zod

## 2. Frontend Conventions (React)

- **Component Structure:** Use functional components with explicitly typed props.
- **Styling:** Use `clsx` and `tailwind-merge` (via `cn()` utility) for conditional classes.
- **Icons:** Use `lucide-react`.
- **Data Fetching:** NEVER call `fetch` directly in components. Create a custom hook using `useQuery` or `useMutation`.
- **UI Library:** Follow the Radix UI + Tailwind pattern (Shadcn-like).
- **Testing:** Use Vitest + React Testing Library.

## 3. Backend Conventions (Go/Fiber)

- **Handler Signature:** Use `func(c *fiber.Ctx) error`.
- **Error Handling:** Return `c.Status(fiber.ErrBadRequest.Code).JSON(...)`. Do not panic.
- **Database:** Use GORM with strictly typed structs.
  - Use `type:text` for content fields that can exceed 255 chars.
  - Use `json.RawMessage` (with `type:json`) for JSON fields, NOT string.
- **Config:** Use Viper for environment variables.
- **JSON:** Use `snake_case` for JSON struct tags.

## 4. Specific "Don'ts"

- Do NOT use `axios` (use standard `fetch` or a lightweight wrapper).
- Do NOT use `useEffect` for data fetching (use TanStack Query).
- Don't manual `go build` or `go test`. Use `make build`, `make test`, or `make dev` (Docker).
