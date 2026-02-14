# Tight Multi-Env Deploy Coordination Plan (Same Host, Concurrent, SHA-Pinned)

## Summary

Harden and standardize dev/staging/prod so all three can run concurrently on one host with deterministic SHA-based deploys, shared gateway/tunnel ingress, secret-file based config, and explicit preflight validation.  
Current setup has several blocking gaps: hardcoded credentials, untracked critical deploy files, `latest`-tag deploy drift, and environment collision risks.

### Findings To Fix First (ordered by severity)

1. Hardcoded DB credentials and fixed image tags in local deploy stack bypass secret files and break security intent at `compose.local.yml:11`, `compose.local.yml:32`, `compose.local.yml:28`, `compose.local.yml:43`.
2. Stage/prod use mutable `latest` images, so deploys are non-deterministic and rollback-unsafe at `compose.prod.yml:3`, `compose.prod.yml:44`, `compose.stage.yml:3`, `compose.stage.yml:44`.
3. Stage/prod effective configs still include `build` from base compose, so deploy behavior is ambiguous (pull vs build) when using `make up` with overlays; confirmed via merged config from `compose.yml:3` plus stage/prod overrides.
4. Critical deploy artifacts are currently not tracked (`compose.stage.yml`, `compose.local.yml`, `scripts/start-sanctum.sh`, prod checklist), so fresh clones/CI cannot reproduce deployment logic consistently.
5. Version policy check is currently broken: `make versions-check` fails because `compose.local.yml` hardcodes managed image versions (`scripts/verify_versions.sh:61` against `compose.local.yml:28`).
6. Same-host concurrent env support is not defined; default Compose project naming collides across environments (containers/networks/volumes).
7. Cloudflared config references a credentials filename that does not match current mounted file naming at `data/cloudflared/config.yaml:2`.
8. Production config validation does not enforce DB SSL mode in app runtime (`backend/internal/config/config.go:185`), while sanity script does enforce it (`scripts/config_sanity.sh:65`), causing policy inconsistency.
9. Secrets on disk are plain files; no permission/preflight enforcement currently exists for deploy scripts (`scripts/start-sanctum.sh:37`).

### Implementation Plan (decision-complete)

1. Normalize environment topology and naming.
Define canonical env IDs: `dev`, `stage`, `prod`.
Set `COMPOSE_PROJECT_NAME=sanctum-<env>` for every env invocation.
Use env-specific network/volume naming through project name isolation (no manual shared names).
Reserve host ports: `dev` frontend/gateway `5173/8375`, `stage` gateway `8081`, `prod` gateway `80`, plus optional ops ports namespaced.

2. Refactor compose layering for deterministic deploy.
Keep `compose.yml` as base runtime contracts only (no environment-specific build/deploy behavior for stage/prod).
Create/commit tracked overlays:
`compose.dev.yml` for local build/hot reload.
`compose.stage.yml` for staged runtime pull-only.
`compose.prod.yml` for prod runtime pull-only.
`compose.gateway.yml` extended to support per-env gateway service naming/ports.
Remove hardcoded creds from compose files; all sensitive values come from env interpolation.
For stage/prod services set:
`image: ghcr.io/<repo>/<service>:${IMAGE_TAG}` and `pull_policy: always`.
For stage/prod remove `build` blocks entirely (or override with null-equivalent via split-base approach).
Keep staging as prod mirror: same service graph and security posture; only scale/hostname/secrets differ.

3. Standardize secrets and env files.
Adopt per-env secret file directories:
`secrets/dev/*`, `secrets/stage/*`, `secrets/prod/*`.
Adopt per-env non-secret env files:
`.env.dev`, `.env.stage`, `.env.prod`.
Implement a new preflight script (`scripts/deploy_preflight.sh`) that verifies:
required files exist, required keys set, no default placeholder secrets, file perms are restrictive, compose config renders.
Update start/deploy script to load only required keys robustly (no blanket `export $(grep ...)` parsing).
Enforce `chmod 600` (or stricter) checks for secret files in preflight.

4. Makefile orchestration hardening.
Add explicit targets:
`make up-dev`, `make up-stage`, `make up-prod`, `make down-dev`, `make down-stage`, `make down-prod`.
Add deploy targets:
`make deploy-stage IMAGE_TAG=<sha>`, `make deploy-prod IMAGE_TAG=<sha>`.
Add `make config-check-all` validating dev/stage/prod merged configs.
Add `make preflight-stage` and `make preflight-prod`.
Keep backward compatibility for existing `ENVIRONMENT=...` targets as wrappers.
Ensure all deploy targets set `COMPOSE_PROJECT_NAME` and correct env/secret inputs explicitly.
Make `versions-check` pass by removing hardcoded managed image versions from local compose and aligning with `infra/versions.env`.

5. CI/CD promotion flow (SHA-pinned).
Continue building/pushing backend/frontend images in CI with SHA tags.
Treat `latest` as optional convenience only; deploy targets must require explicit `IMAGE_TAG`.
Add a lightweight promotion workflow or documented procedure:
stage deploy with SHA, smoke verify, then prod deploy same SHA.
Record deployed SHA per env in a tracked release note or deployment state file.

6. Gateway/tunnel unification for same-host concurrent envs.
Use gateway as stable ingress entry for stage/prod.
Update cloudflared config to map prod hostname to prod gateway port and stage hostname to stage gateway port.
Fix credentials filename/path consistency for cloudflared config.
Add health checks for gateway and tunnel services and include them in preflight/smoke checks.

7. Runtime config policy alignment.
Re-enable strict production DB SSL enforcement in app config validation to match sanity script policy.
Set staging `DB_SCHEMA_MODE` to mirror prod (`sql`) per your “prod mirror” requirement.
Keep destructive automigrate disabled everywhere by default.
Ensure dev-only root bootstrap remains blocked outside development.

8. Documentation and report updates.
Update `README.md` deployment section to documented, exact commands for same-host concurrent model.
Add a deploy runbook under `docs/operations/` with:
preflight, deploy stage, validate, promote to prod, rollback by SHA.
Create substantial-work report in `docs/reports/YYYY-MM-DD-HHMM-compose-deploy-hardening.md` from template.

### Public Interfaces / Contract Changes

1. New required deploy variable: `IMAGE_TAG` for stage/prod deploy targets.
2. New env file convention: `.env.dev`, `.env.stage`, `.env.prod`.
3. New secret directory convention: `secrets/<env>/...`.
4. New Make targets: `up-*`, `down-*`, `deploy-*`, `preflight-*`, `config-check-all`.
5. Optional deprecation path for old `ENVIRONMENT=...` usage (kept as wrappers initially).

### Test Cases and Validation Scenarios

1. Compose render tests:
`docker compose ... config` passes for dev/stage/prod with no unresolved variables.
2. Concurrency test:
bring up dev, stage, prod simultaneously; verify unique container names, networks, and volumes.
3. Ingress test:
prod hostname routes to prod stack; staging hostname routes to stage stack; no cross-routing.
4. Determinism test:
deploy exact SHA twice and verify no image drift.
5. Rollback test:
redeploy previous SHA and verify readiness endpoint recovery.
6. Security checks:
preflight fails on default/weak/missing secrets and loose file permissions.
7. Policy checks:
`make versions-check` passes.
`make config-sanity` and app startup enforce the same production SSL expectations.

### Assumptions and Defaults Chosen

1. Deployment topology is same host, with concurrent `dev + stage + prod`.
2. Deploy strategy is immutable SHA pinning.
3. Staging mirrors production behavior/security.
4. Ingress model is gateway + secret files (not direct frontend port exposure as primary control plane).
5. Compose remains the deployment runtime (not Swarm/Kubernetes migration).
