# Local Dev Bootstrap + Docker Hygiene

## Metadata

- Date: `2026-02-19`
- Branch: `master`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Makefile bootstrap workflow, compose base/override hardening, README quick-start updates`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["infra", "docs"],
  "Lessons": [
    {
      "title": "Keep base compose production-safe and push dev-only behavior to overrides",
      "severity": "HIGH",
      "anti_pattern": "Bind-mounting source and dev node_modules in the base compose file used by production profiles",
      "detection": "rg -n \"\\.:/app|./frontend:/app|/app/node_modules\" compose.yml",
      "prevention": "Use compose.override.yml for hot-reload mounts/commands and keep compose.yml runtime-safe defaults only"
    }
  ]
}
```

## Summary

- What was requested:
  - Add one command to bootstrap local dev (`env` + frontend deps + backend deps in Docker).
  - Keep hot reload for local development.
  - Make Docker/compose layout safer for production by removing dev-only behavior from base compose.
- What was delivered:
  - Added `make setup-local` (`make bootstrap` alias).
  - Added `deps-install-backend-local` using `docker compose run --rm --no-deps`.
  - Moved dev-only mounts out of `compose.yml` and kept dev-only node_modules mount as named volume in override.
  - Updated README Quick Start and command listings.

## Changes Made

- `Makefile`
  - Added `setup-local` and `bootstrap` targets.
  - Added `deps-install-backend-local` target:
    - `./scripts/compose.sh $(COMPOSE_FILES) run --rm --no-deps app sh -c "cd /app/backend && go mod download"`
  - Kept existing `deps-install-backend` (exec-based).
  - Updated `make help` sections with bootstrap targets.
  - Removed `--renew-anon-volumes` from `make dev` to prevent dependency churn on restart.
- `compose.yml`
  - Removed app source bind mount (`.:/app`) from base compose.
  - Removed frontend source/node_modules mounts from base compose.
  - Kept runtime-safe volumes (`uploads_data`) only.
- `compose.override.yml`
  - Switched frontend node_modules from anonymous mount to named volume:
    - `frontend_node_modules:/app/node_modules`
  - Added named volume declaration under `volumes:`.
- `README.md`
  - Quick Start now uses `make setup-local` before `make dev`.
  - Clarified backend dependency bootstrap runs in Docker and host Go remains optional.
  - Added `setup-local` to Development and Utilities command lists.

## Validation

- Commands run:
  - `ENVIRONMENT=prod make config-check`
  - `make config-sanity`
  - `make help`
  - `git diff -- Makefile compose.yml compose.override.yml README.md`
  - `git status --short`
- Test results:
  - `ENVIRONMENT=prod make config-check` passed and rendered base compose without dev bind mounts.
  - `make config-sanity` passed (`env=development`, `schema_mode=sql`).
  - `make help` includes `setup-local` and `bootstrap` in command listings.
- Manual verification:
  - Verified target wiring and compose layering logic in edited files.

## Risks and Regressions

- Known risks:
  - `deps-install-backend-local` may require Docker daemon availability and image build on first run.
  - Existing workflows that depended on anonymous frontend node_modules volume semantics may observe one-time volume change behavior.
- Potential regressions:
  - If any production workflow implicitly relied on source bind mounts in base compose, behavior now changes to safer default.
- Mitigations:
  - Dev behavior preserved in `compose.override.yml`.
  - `setup-local` is additive and non-destructive; existing commands remain intact.

## Follow-ups

- Remaining work:
  - Run full runtime workflow checks for container startup and hot reload:
    - `make setup-local`
    - `make dev`
- Recommended next steps:
  - Consider adding a `make verify-local-bootstrap` smoke target to automate the above checks.

## Rollback Notes

- How to revert safely if needed:
  - Revert these files:
    - `Makefile`
    - `compose.yml`
    - `compose.override.yml`
    - `README.md`
  - Remove this report file:
    - `docs/reports/2026-02-19-0958-local-dev-bootstrap-docker-hygiene.md`
