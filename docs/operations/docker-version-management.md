# Docker and Compose Version Management

This project uses a single version catalog so Dockerfiles and Compose files stay aligned.

## Source of Truth

- Version catalog: `infra/versions.env`
- Compose wrapper: `scripts/compose.sh`
- Consistency checker: `scripts/verify_versions.sh`

`infra/versions.env` is the only file where image/base version values should be changed.

## How It Works

1. Compose commands run through `scripts/compose.sh`, which injects:
   - `--env-file infra/versions.env`
   - `--env-file .env` (if present)
2. Compose files reference version variables (example: `postgres:${POSTGRES_VERSION}`).
3. Dockerfiles use `ARG` defaults that match the catalog (example: `ARG GO_VERSION=...`).
4. `make versions-check` enforces catalog consistency.

## Day-to-Day Commands

- Validate versions are in sync:
  - `make versions-check`
- Validate compose config:
  - `make config-check`
- Check latest available upstream tags:
  - `make check-versions`
- Build using catalog values:
  - `make build`

## Updating Versions

1. Edit `infra/versions.env`.
2. Run:
   - `make versions-check`
   - `make config-check`
   - `make build`
3. Run relevant tests.
4. Commit catalog update with any required compatibility fixes.

## Adding a New Image

When introducing a new Docker image:

1. Add a variable to `infra/versions.env`.
2. Use that variable in the target compose file (or Dockerfile `ARG`).
3. Extend `scripts/verify_versions.sh` to enforce it.
4. Add/update Renovate rule for the new catalog variable in `.github/renovate.json`.

## Automation

- Renovate updates catalog versions via regex managers in `.github/renovate.json`.
- Freshness workflow: `.github/workflows/freshness.yml`
  - Validates compose files
  - Runs `make versions-check`
  - Builds backend/frontend images
  - Prints outdated dependency reports

## Policy

- Patch updates: can be auto-merged if CI passes.
- Minor updates: review required.
- Major updates: manual review and compatibility validation required.

## Troubleshooting

- Error: unresolved compose variable
  - Ensure command ran through `make` or `scripts/compose.sh`.
- Error: `versions-check` failed
  - Fix drift between `infra/versions.env` and compose/dockerfile references.
- Error: local `.env` missing values
  - Run `make env` and re-run command.
