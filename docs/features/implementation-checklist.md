# Project Implementation Checklist (Active)

This is the active implementation TODO for the repository.

Historical and point-in-time analyses are in `docs/reports/` and should be treated as reference snapshots, not active checklists.

## Related References

- Repo-wide AI and workflow rules: `/AGENTS.md`
- Frontend-specific AI guidance: `frontend/AGENTS.md`
- Backend testing guidance: `backend/TESTING.md`
- Redis canonical guidance: `backend/docs/REDIS_BEST_PRACTICES.md`
- Historical reports:
  - `docs/reports/2026-02-06-full-stack-review.md`
  - `docs/reports/2026-01-31-deployment-readiness.md`
  - `docs/reports/2026-02-12-2250-deep-production-review.md`

## 🔴 Critical - Tier 1: Production Readiness

### CI/CD & Repo Hygiene

- [x] **Fix and Harden CI Pipeline**
  - Pin GitHub Actions to stable versions (checkout, setup-go, buildx)
  - Ensure `go test ./...` runs on every PR
  - Add nightly `go test -race ./...` job
  - Fail CI on linting, formatting, or test errors
  - Optionally add OpenAPI drift check (generate + diff)

### Health & Availability

- [x] **Split Health Endpoints Correctly**
  - `/health/live` → process is up
  - `/health/ready` → DB, Redis, dependencies
  - Ensure JSON status reflects failures correctly
  - Wire readiness into Docker Compose / orchestration

### Authentication & Security

- [x] **JWT Refresh & Session Strategy**
  - Reduce access token lifetime to ~15 minutes
  - Implement refresh token rotation
  - Add server-side token revocation support

- [x] **WebSocket Auth Hardening**
  - Replace JWT-in-query with short-lived WS ticket exchange
  - Ensure ticket is single-use and short TTL

- [x] **Secrets & Config Hardening**
  - Enforce strong secrets in production
  - Validate critical env vars at startup
  - Remove insecure production defaults

### Observability

- [x] **Structured Logging + Correlation IDs**
  - Include request ID and key context in logs

- [x] **Metrics Baseline**
  - Request rates, error rates, p95/p99 latency
  - Active WebSocket connections
  - Redis and DB error rates

## 🟡 Tier 2: Scale-Ready Architecture

### API Contracts

- [x] **OpenAPI as source of truth**
  - [x] Add OpenAPI drift guard in CI (`.github/workflows/openapi-drift.yml`)
  - [x] Keep backend/frontend contract synchronized (automated path coverage check via `scripts/check_openapi_frontend_sync.sh`)
  - [x] Add backward-compatibility checks against base branch OpenAPI in CI (`backend/cmd/openapi-compat`, wired in `.github/workflows/openapi-drift.yml`)
  - [x] Document contract-change workflow in contributor docs (`docs/operations/runbooks/ci-runbook.md`)

### Data and Caching

- [x] **Index and query audit for hot paths**
- [x] **Codify caching inventory (key, TTL, invalidation, fallback)**
  - Canonical guidance: `backend/docs/REDIS_BEST_PRACTICES.md`
  - Current inventory constants/helpers: `backend/internal/cache/inventory.go`

### Realtime Reliability

- [x] **WebSocket scaling guardrails**
  - Connection limits (`maxConnsPerUser`, `maxTotalConns`) in `backend/internal/notifications/hub.go`
  - Backpressure strategy (non-blocking sends with drop-on-full behavior) in `backend/internal/notifications/hub.go` and `backend/internal/notifications/client.go`
  - Heartbeats and cleanup guarantees (ping/pong deadlines, unregister on disconnect) in `backend/internal/notifications/client.go`

## 🧪 Tier 3: Reliability and Safety Nets

### Testing and Quality Gates

- [x] **Strengthen critical-path integration coverage**
  - Added auth session lifecycle integration coverage (signup → refresh rotation → logout revocation) in `backend/test/auth_session_integration_test.go`
- [x] **Add race-detection test job**
  - Added PR-time race smoke job in `.github/workflows/ci.yml` (`go test -race ./internal/...`)
  - Nightly full race sweep remains in `.github/workflows/nightly-race.yml`
- [x] **Add load tests for login/feed/chat send**
  - Added build-tagged load smoke suite in `backend/test/load_smoke_test.go`
  - Added `make test-load` and documented execution in `backend/TESTING.md`

### Delivery Safety

- [x] **Feature flag strategy for controlled rollouts**
  - Added backend flag manager with boolean and percentage rollout support in `backend/internal/featureflags/manager.go`
  - Added admin visibility endpoint `GET /api/admin/feature-flags`
  - Added rollout guidance in `docs/FEATURE_FLAGS.md`
- [x] **Rollback-ready deployment process**
  - Added rollback playbook in `docs/operations/runbooks/rollback-runbook.md`
  - Added guarded rollback helper `scripts/rollback_to_ref.sh` (dry-run default, execute mode with readiness checks and auto-fallback)
