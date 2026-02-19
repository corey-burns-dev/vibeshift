# Contributing to Sanctum

Thanks for contributing. This doc captures the default local workflow and quality gates.

## Project Philosophy

- Prefer clarity over cleverness.
- Keep diffs small and reviewable.
- Preserve behavior unless the change explicitly updates behavior.

## Branching

- `master` is protected.
- Open a feature/fix branch and use PRs for merges.

## Local Setup

1. Clone the repo.
2. Run:

```bash
make setup-local
```

This bootstraps env/deps and installs repo-managed git hooks (`core.hooksPath=.githooks`).

## Hooks

- Install hooks manually if needed:

```bash
make install-githooks
```

- Verify hooks are configured:

```bash
make verify-githooks
```

## Frontend Quality Gate (Before Push)

Run the canonical frontend gate:

```bash
make check-frontend
```

This runs:

- `bun install --frozen-lockfile`
- `make lint-frontend` (check-only)
- `make type-check-frontend`
- `make test-frontend`
- `bun run build`

For autofixable frontend lint/format issues:

```bash
make lint-frontend-fix
```

## Backend Quality Gate

Run backend checks as needed:

```bash
make fmt
make lint
make test-backend
```
