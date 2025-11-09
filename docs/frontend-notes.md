# Frontend Architecture Notes

## Current Setup

- React + Vite project already running in Docker
- Go (Fiber) backend exposes REST API; frontend communicates over HTTP

## Framework Choice

- Stay on React + Vite unless you specifically need server-side rendering or
  built-in routing
- Consider Next.js/Remix only if you plan to add SSR, file-based routing, or
  server-initiated rendering soon

## Data Management Strategy

- Use TanStack Query to manage all server state (API data): caching, retries,
  mutations, pagination
- Keep UI-only state with simple tools (React context or Zustand); avoid Redux
  unless workflows are very complex
- Generate TypeScript types from the Go API (OpenAPI via swaggo or oapi-codegen)
  to keep client/server in sync
- Use the native `fetch` API or a small wrapper (e.g., `ky`); let TanStack Query
  handle retry/cancel/error behavior

## API Hook Conventions

- Group data hooks by resource: `usePosts`, `usePost(id)`, `useCreatePost`
- Centralize URLs, schema parsing, and optimistic updates inside hooks rather than components
- Handle mutation side effects there as well: optimistic updates, invalidation, and rollback logic

## Routing & Prefetching

- Introduce React Router (with Vite) for multi-page structure and data prefetch per route
- Preload data on route transitions through TanStack Query `prefetchQuery`

## Forms & Validation

- Use React Hook Form or Formik for complex forms
- Validate inputs with Zod or Yup so frontend and backend share schema rules

## Immediate Action Items

1. Install TanStack Query and wrap the app with `QueryClientProvider`
2. Scaffold typed API hooks for existing Go endpoints
3. Add React Router if you need multiple pages and set up prefetching
