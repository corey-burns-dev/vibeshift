This folder contains centralized test assets and recommended layout for the Sanctum frontend tests.

Recommended layout (professional team):

- `src/` - application source; unit tests colocated next to components as `*.test.{ts,tsx}` or `*.spec.tsx`.
- `src/test/` - shared unit/integration test helpers (mocks, renderWithProviders, setup files).
- `test/e2e/` - Playwright end-to-end tests and fixtures (global-setup, fixtures, utils, specs).

Migration note: the project currently stores Playwright tests at `test/tests/e2e/`. We recommend migrating those files into `test/e2e/` (see `../../scripts/migrate-frontend-e2e.sh`). The migration script is safe and idempotent.

Why this layout?

- Keeps unit tests close to implementation for rapid iteration.
- Centralizes large/long-running E2E tests in `test/e2e` so CI and developers can opt-in.
- Shared helpers live under `src/test` to keep imports short and colocated with source types.
