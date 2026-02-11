# Project Implementation Checklist (Active)

This is the active implementation TODO for the repository.

Historical and point-in-time analyses are in `docs/reports/` and should be treated as reference snapshots, not active checklists.

## Related References

- Repo-wide AI and workflow rules: `/AI.md`
- Frontend-specific AI guidance: `frontend/AI.md`
- Backend testing guidance: `backend/TESTING.md`
- Redis canonical guidance: `backend/docs/REDIS_BEST_PRACTICES.md`
- Historical reports:
  - `docs/reports/2026-02-06-full-stack-review.md`
  - `docs/reports/2026-01-31-deployment-readiness.md`
  - `docs/reports/2025-06-01-review-implementation.md`

## 🔴 Critical - Tier 1: Production Readiness

### CI/CD & Repo Hygiene

- [x] **Fix and Harden CI Pipeline**
  - Pin GitHub Actions to stable versions (checkout, setup-go, buildx)
  - Ensure `go test ./...` runs on every PR
  - Add nightly `go test -race ./...` job
  - Fail CI on linting, formatting, or test errors
  - Optionally add OpenAPI drift check (generate + diff)

### Health & Availability

- [ ] **Split Health Endpoints Correctly**
  - `/health/live` → process is up
  - `/health/ready` → DB, Redis, dependencies
  - Ensure JSON status reflects failures correctly
  - Wire readiness into Docker Compose / orchestration

### Authentication & Security

- [ ] **JWT Refresh & Session Strategy**
  - Reduce access token lifetime to ~15 minutes
  - Implement refresh token rotation
  - Add server-side token revocation support

- [ ] **WebSocket Auth Hardening**
  - Replace JWT-in-query with short-lived WS ticket exchange
  - Ensure ticket is single-use and short TTL

- [ ] **Secrets & Config Hardening**
  - Enforce strong secrets in production
  - Validate critical env vars at startup
  - Remove insecure production defaults

### Observability

- [ ] **Structured Logging + Correlation IDs**
  - Include request ID and key context in logs

- [ ] **Metrics Baseline**
  - Request rates, error rates, p95/p99 latency
  - Active WebSocket connections
  - Redis and DB error rates

## 🟡 Tier 2: Scale-Ready Architecture

### API Contracts

- [ ] **OpenAPI as source of truth**
  - Keep backend/frontend contract synchronized
  - Add backward-compatibility checks

### Data and Caching

- [ ] **Index and query audit for hot paths**
- [ ] **Codify caching inventory (key, TTL, invalidation, fallback)**

### Realtime Reliability

- [ ] **WebSocket scaling guardrails**
  - Connection limits
  - Backpressure strategy
  - Heartbeats and cleanup guarantees

## 🧪 Tier 3: Reliability and Safety Nets

### Testing and Quality Gates

- [ ] **Strengthen critical-path integration coverage**
- [ ] **Add race-detection test job**
- [ ] **Add load tests for login/feed/chat send**

### Delivery Safety

- [ ] **Feature flag strategy for controlled rollouts**
- [ ] **Rollback-ready deployment process**
