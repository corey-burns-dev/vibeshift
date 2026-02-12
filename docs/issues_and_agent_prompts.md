# One-Issue-Per-Task Plan (with AI Agent Prompts)

> You do **not** need to manually write anything in GitHub.
> This file is designed to be used with **GitHub CLI** or copied verbatim if you prefer UI later.

---

## How This Works (Read This Once)

You will:

1. Create milestones in GitHub **once**
2. Use `gh issue create` to create issues **directly from this file**
3. Use the matching AI prompt **one issue at a time**

This mirrors how senior engineers batch-plan but execute incrementally.

---

## Milestone 1 — Production Safety Baseline

## Issue: Harden CI pipeline

**Milestone:** Production Safety Baseline

**Description**
Pin GitHub Actions, ensure tests run on every PR, and fail fast. CI must be trustworthy before any other work.

**Acceptance Criteria**

- Actions pinned to stable versions
- `go test ./...` runs on PRs
- CI fails on test failure

**Agent Prompt**
Explain what makes CI trustworthy in Go projects. Then update the GitHub Actions workflow to pin action versions and run `go test ./...` on PRs. Show diffs and briefly explain each change.

---

## Issue: Nightly race detector

**Milestone:** Production Safety Baseline

**Description**
Add a scheduled job that runs `go test -race` to catch concurrency issues early.

**Acceptance Criteria**

- Nightly scheduled workflow
- Race detector runs without blocking PR CI

**Agent Prompt**
Explain what the Go race detector finds and when to use it. Add a scheduled GitHub Actions workflow that runs `go test -race ./...` nightly. Show the full YAML.

---

## Issue: Correct health endpoints

**Milestone:** Production Safety Baseline

**Description**
Split health checks into liveness and readiness so orchestration behaves correctly.

**Acceptance Criteria**

- `/health/live` checks process only
- `/health/ready` checks DB and Redis
- Non-200 on dependency failure

**Agent Prompt**
Explain liveness vs readiness. Implement `/health/live` and `/health/ready`. Readiness must check DB and Redis and return 503 on failure with clear JSON output. Show diffs.

---

## Issue: Fail-fast runtime config validation

**Milestone:** Production Safety Baseline

**Description**
Ensure the app refuses to start with invalid configuration.

**Acceptance Criteria**

- Required env vars validated on startup
- Invalid config causes crash with clear logs

**Agent Prompt**
Explain fail-fast configuration validation. Implement startup validation for required env vars (JWT, DB, Redis, CORS). Make the server exit on invalid config. Show diffs.

---

# Milestone 2 — Data Integrity & Performance

## Issue: Remove AutoMigrate from production

**Milestone:** Data Integrity & Performance

**Description**
Prevent runtime schema mutation in production.

**Acceptance Criteria**

- AutoMigrate not executed in prod
- Optional dev-only flag if retained

**Agent Prompt**
Explain why runtime automigration is dangerous in production. Remove AutoMigrate from prod paths and gate it behind an explicit dev flag if retained. Show diffs.

---

## Issue: Introduce controlled DB migrations

**Milestone:** Data Integrity & Performance

**Description**
Add versioned database migrations with rollback support.

**Acceptance Criteria**

- Migration tool integrated
- Existing schema represented
- Manual ALTER statements moved into migrations

**Agent Prompt**
Explain database migrations and why they matter. Add goose or golang-migrate, create initial migrations, and document how to run them. Convert any runtime ALTER TABLE into migrations. Show diffs.

---

## Issue: Add DB indexes and constraints

**Milestone:** Data Integrity & Performance

**Description**
Improve performance and enforce data invariants early.

**Acceptance Criteria**

- Indexes added for hot paths
- Uniqueness constraints added where required

**Agent Prompt**
Explain indexes and unique constraints. Identify hot queries and add indexes and uniqueness constraints via migrations. Provide diffs and rationale for each index.

---

# Milestone 3 — Security Reality

## Issue: Refresh token flow

**Milestone:** Security Reality

**Description**
Short-lived access tokens with refresh and rotation.

**Acceptance Criteria**

- Access tokens ~15 minutes
- Refresh tokens stored server-side
- Rotation implemented

**Agent Prompt**
Explain access vs refresh tokens and rotation. Implement refresh token flow with Redis storage and 15-minute access tokens. Show diffs and tests.

---

## Issue: Decide auth storage model

**Milestone:** Security Reality

**Description**
Make an explicit decision on token storage and document it.

**Acceptance Criteria**

- Decision documented
- Implementation matches decision

**Agent Prompt**
Explain tradeoffs between localStorage, in-memory tokens, and httpOnly cookies. Recommend one for this app, implement it, and document the threat model.

---

## Issue: CSRF protection (if cookies)

**Milestone:** Security Reality

**Description**
Protect against cross-site request forgery when using cookies.

**Acceptance Criteria**

- CSRF protection implemented
- Sensitive endpoints protected

**Agent Prompt**
Explain CSRF and when it applies. If auth uses cookies, implement CSRF protection suitable for SPA + API. Show diffs and explain frontend integration.

---

## Issue: CSP and security headers

**Milestone:** Security Reality

**Description**
Reduce XSS blast radius and harden browser protections.

**Acceptance Criteria**

- CSP added for production
- Security headers hardened

**Agent Prompt**
Explain CSP and security headers. Add a production-safe CSP and harden headers via middleware. Disable dev-only dashboards in prod. Show diffs.

---

# Milestone 4 — Realtime at Scale

## Issue: WebSocket connection limits

**Milestone:** Realtime at Scale

**Description**
Prevent WS abuse and resource exhaustion.

**Acceptance Criteria**

- Per-user WS connection limit enforced
- Cleanup on disconnect

**Agent Prompt**
Explain why per-user WS limits matter. Implement connection caps with correct cleanup. Use Redis if multi-instance. Show diffs.

---

## Issue: WebSocket heartbeat

**Milestone:** Realtime at Scale

**Description**
Detect and clean up dead connections.

**Acceptance Criteria**

- Ping/pong implemented
- Dead connections cleaned up

**Agent Prompt**
Explain WS heartbeat mechanics. Implement server-side ping/pong and stale connection cleanup. Show diffs.

---

## Issue: WebSocket abuse controls

**Milestone:** Realtime at Scale

**Description**
Rate-limit abusive realtime actions.

**Acceptance Criteria**

- Rate limits per message type
- Clear handling on violation

**Agent Prompt**
Explain realtime abuse patterns. Implement per-user WS rate limits by message type. Show diffs.

---

# Milestone 5 — Observability

## Issue: Prometheus metrics endpoint

**Milestone:** Observability

**Description**
Expose real Prometheus metrics.

**Acceptance Criteria**

- `/metrics` returns Prometheus format

**Agent Prompt**
Explain Prometheus metrics vs dashboards. Add a /metrics endpoint using Go Prometheus client. Show diffs.

---

## Issue: Custom metrics

**Milestone:** Observability

**Description**
Track DB latency, Redis errors, and WS connections.

**Acceptance Criteria**

- Histograms, counters, and gauges added

**Agent Prompt**
Explain counters, gauges, and histograms. Add metrics for DB latency, Redis errors, and WS connection counts. Show diffs.

---

## Issue: Distributed tracing

**Milestone:** Observability

**Description**
Trace requests across system layers.

**Acceptance Criteria**

- OpenTelemetry configured
- HTTP + DB spans visible

**Agent Prompt**
Explain tracing and sampling. Add OpenTelemetry tracing with HTTP and DB spans. Show diffs and how to view traces locally.

---

# Milestone 6 — Architecture Quality

## Issue: Service layer refactor

**Milestone:** Architecture Quality

**Description**
Move business logic out of handlers.

**Acceptance Criteria**

- internal/service package exists
- At least one feature fully refactored

**Agent Prompt**
Explain service-layer architecture. Create internal/service and refactor one feature end-to-end. Show diffs.

---

## Issue: Async job queue

**Milestone:** Architecture Quality

**Description**
Move non-critical work to background jobs.

**Acceptance Criteria**

- Job queue integrated
- One workflow migrated

**Agent Prompt**
Explain background jobs, retries, and DLQs. Add Asynq (or similar) and migrate one task. Show diffs.

---

## Issue: Spec-first OpenAPI workflow

**Milestone:** Architecture Quality

**Description**
Make API contracts the source of truth.

**Acceptance Criteria**

- OpenAPI validated or generated
- Drift check added to CI

**Agent Prompt**
Explain spec-first APIs. Implement OpenAPI validation or generation and add a CI drift check. Show diffs.

---

# You Are Done Planning

From here on:

- **One issue at a time**
- **One agent per issue**
- Learn *why* before *how*

This is senior-level workflow. 🚀
