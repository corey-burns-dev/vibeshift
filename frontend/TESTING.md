# Frontend Testing Guide

This document describes how to run and write tests for the Sanctum frontend.

## Running tests

From the `frontend/` directory (or repo root via Make):

| Command                  | Description                         |
| ------------------------ | ----------------------------------- |
| `bun run test`           | Run unit tests in watch mode        |
| `bun run test:run`       | Run unit tests once                 |
| `bun run test:coverage`  | Run unit tests with coverage report |
| `bun run test:e2e`       | Run Playwright E2E tests            |
| `bun run test:e2e:smoke` | Run only @smoke E2E tests           |
| `make test-frontend`     | Run unit tests from repo root       |

**Prerequisites for E2E:** Backend and frontend must be running, and Playwright browsers installed (`bun run test:e2e:install` for local/browser-only install, or `bun run test:e2e:install:system` when OS deps must also be installed).

## Running Playwright in Docker

If your host is missing Bun/Playwright or system libraries, run Playwright inside a container that includes the required OS libraries and browsers.

From the repo root:

```bash
# build & run (artifacts placed under frontend/reports)
./scripts/run-playwright-docker.sh --grep @smoke --workers=2
```

The helper builds `frontend/Dockerfile.e2e` and runs tests with host networking so the container can reach services started on the runner. Artifacts (HTML report, traces, test-results) are saved to `frontend/reports/` on the host. Pass any Playwright CLI args and they will be forwarded into the container.

## Test structure

- **Unit tests**: Vitest + React Testing Library. Live next to source or in `src/**/*.test.{ts,tsx}` or `*.spec.tsx`.
- **E2E tests**: Playwright in `test/e2e/*.spec.ts` (legacy: `test/tests/e2e/*`).
- **Setup**: `src/test/setup.ts` runs before unit tests (jest-dom, matchMedia, ResizeObserver, IntersectionObserver mocks).
- **Utilities**: `src/test/test-utils.tsx` provides custom `render`, `renderHook`, `createTestQueryClient`, mock factories (`buildUser`, `buildMessage`, etc.), and `createLocalStorageMock()`.

## Writing unit tests

### Hooks

- Use `renderHook` from `@testing-library/react` with a wrapper that provides `QueryClientProvider` (and optionally `MemoryRouter`).
- Mock `@/api/client` with `vi.mock('@/api/client', () => ({ apiClient: { method: vi.fn(), ... } }))` and `vi.mocked(apiClient).method.mockResolvedValue(...)`.
- For hooks that read `localStorage` or `getCurrentUser`, set `localStorage` in the test (or use a `beforeAll` that defines `globalThis.localStorage`).

Example:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/test-utils'

const wrapper = ({ children }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    {children}
  </QueryClientProvider>
)

const { result } = renderHook(() => useSanctums(), { wrapper })
await waitFor(() => expect(result.current.isSuccess).toBe(true))
```

### Components

- Use `render` from `@testing-library/react` with wrappers (e.g. `MemoryRouter`, `QueryClientProvider`) as needed.
- Prefer `screen.getByRole`, `getByLabelText`, `getByText` for queries.
- Mock heavy dependencies (e.g. `UserMenu`, `usePresenceStore`) with `vi.mock()`.

### Pages

- Same as components; mock data hooks (`useSanctums`, `useFriends`, etc.) to control loading, error, and data states.
- Use `renderWithProviders` or the `render` from `test-utils` to get Router + QueryClient.

## Mocking patterns

- **API client**: `vi.mock('@/api/client', () => ({ apiClient: { getX: vi.fn(), ... } }))`.
- **Router**: `vi.mock('react-router-dom', async () => ({ ...actual, useNavigate: () => vi.fn() }))`.
- **localStorage**: In tests that need it, use a `beforeAll` that sets `globalThis.localStorage` to an object with `getItem`, `setItem`, `removeItem`, `clear`.
- **WebSocket**: Replace `globalThis.WebSocket` with a class that tracks instances and simulates `onopen` / `onmessage`.
- **Toast**: `vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))`.

## Coverage

- Configured in `vitest.config.ts` under `test.coverage`.
- Provider: `v8`. Reporters: `text`, `html`, `lcov`.
- Excluded: `node_modules`, `dist`, `**/*.test.*`, `**/*.spec.*`, `**/test/**`, `**/components/ui/**`, etc.
- Thresholds are set in the config; raise them (e.g. to 70% lines, 70% functions, 60% branches) as the suite grows.

## E2E

- **Global setup** (`test/tests/e2e/global-setup.ts`): Creates authenticated user and admin storage states under `test/tests/e2e/.auth/`.
- **Auth**: Use `test.use({ storageState: USER_STATE_PATH })` or `ADMIN_STATE_PATH` for authenticated tests.
- **Base URL**: `PLAYWRIGHT_BASE_URL` (default `http://localhost:5173`). API: `PLAYWRIGHT_API_URL` (default `http://localhost:8375/api`).

## CI

- Run `make test-frontend` for unit tests.
- E2E typically runs in CI with backend and frontend started; ensure global setup can reach the API and DB (e.g. for admin promotion).
