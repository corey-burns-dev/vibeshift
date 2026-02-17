# E2E Testing Guide

This directory contains end-to-end tests for the Sanctum application using Playwright.

Canonical location: `frontend/test/e2e/` (legacy: `frontend/test/tests/e2e/`).

See `frontend/TESTING.md` for general testing guidelines and run commands.
Playwright E2E tests for Sanctum.

Canonical location: `frontend/test/e2e/` (legacy: `frontend/test/tests/e2e/`).

Contents expected here:

- `global-setup.ts`, `global-teardown.ts`
- `config.ts`
- `fixtures/` (auth storage states)
- `utils/` (helpers for tests)
- `*.spec.ts` Playwright specs

To run locally (from `frontend/`):

```bash
# install browsers if needed
bun run test:e2e:install

# run full e2e suite
bun run test:e2e
```

If you prefer to migrate existing tests from the legacy folder, run the repository script `scripts/migrate-frontend-e2e.sh` from the repo root.
