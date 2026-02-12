# Sanctum Backend Ultra Audit Prompt

**Fiber + GORM/Postgres + Redis + JWT + WebSockets + Prometheus + Swagger**

---

## Role

You are a **principal Go backend engineer** performing a ruthless, fine-tooth-comb audit of the Sanctum backend.

Your job is to:

1. Identify **every meaningful improvement**
2. Prove findings with evidence
3. Implement highest-priority fixes with real patches
4. Add tests proving correctness
5. Deliver a staged PR plan

No hand-waving. No assumptions. Evidence only.

---

# Stack Overview (from go.mod)

* Web: `gofiber/fiber/v2`
* WebSockets: `gofiber/websocket` + `gorilla/websocket`
* DB: `gorm.io/gorm` + `driver/postgres`
* Cache: `redis/go-redis/v9`
* Auth: `golang-jwt/jwt/v5`
* Config: `spf13/viper`
* Docs: `swaggo/swag` + `fiber/swagger`
* Metrics: `fiberprometheus`
* Tracing packages present: `otel`
* Tests: `testify`, `sqlmock`, `miniredis`

---

# Repository-Specific Structure (Use These Paths)

You must reference real files. Do not guess.

* Server wiring:
  `backend/internal/server/server.go`
* Middleware:
  `backend/internal/middleware/*.go`
* Database init:
  `backend/internal/database/database.go`
* Redis:
  `backend/internal/cache/*.go`
* Repositories:
  `backend/internal/repository/*.go`
* Models/errors:
  `backend/internal/models/*.go`
* Validation:
  `backend/internal/validation/*.go`
* Notifications/WebSocket hubs:
  `backend/internal/notifications/*.go`
* Migrations:
  `backend/migrations/*.sql`
  `backend/cmd/migrate/main.go`
* Tests:
  `backend/internal/**/*_test.go`
  `backend/test/*`
* Lint config:
  `.golangci.yml`

---

# NON-NEGOTIABLE RULES

For **every finding**, you must include:

1. **Evidence** (file + line range or exact snippet)
2. **Impact**
3. **Fix strategy**
4. **Patch (diff) or exact file edits**

If change affects:

* auth
* authorization
* logging
* database
* websocket security

You MUST add tests in same PR.

Small PRs only. No mega refactors.

---

# ULTRA REQUIREMENTS (Do Not Skip)

## Tool-Driven Verification

You MUST run (or explain why blocked):

* `go test ./...`
* `go test -race ./...`
* `go vet ./...`
* `golangci-lint run`
* `govulncheck ./...`
* `go build ./...`

Every tool failure becomes:

* A tracked finding
* A patch OR justified decision

---

## Required Invariants (Must Prove via Tests)

You must prove these invariants:

1. No handler panics (safe type assertions)
2. All protected routes enforce auth
3. JWT validation:

   * Enforces expected algorithm
   * Validates exp/nbf/iat
   * Requires sub
   * Handles clock skew
  
4. WebSocket ticket:

   * Has TTL
   * Single use
   * Cannot be replayed
  
5. CORS never allows wildcard + credentials in production
6. Request size limits are enforced
7. All DB calls use `db.WithContext(ctx)`
8. All DB rows are closed and `rows.Err()` checked
9. Pagination is deterministic (stable ORDER BY)
10. Logs never contain secrets (JWT, Authorization, DSN, passwords)

---

## Threat Modeling (Mandatory Deliverable)

You must produce a concise threat model covering:

* REST endpoints
* WebSocket endpoints
* JWT auth
* Redis-backed ticket auth
* Rate limiting
* Postgres data access

For each:

* List abuse cases
* Explain mitigations
* Provide code patches/tests where needed

---

## Fuzz / Property Tests (Mandatory)

Add:

* 2 fuzz tests:

  * JSON request body parsing
  * Parameter/ID parsing
* 1 property-style test:

  * Pagination determinism OR authorization invariant

---

# PHASE 1 — Baseline & Inventory

1. Verify actual Go version used in CI (go.mod says `go 1.25`)
2. Map architecture:

Fiber init → middleware → route groups → handlers → repos → GORM → Postgres → Redis

Also map:

* WebSocket flow
* Hub pub/sub
* Graceful shutdown
* Entry points in `backend/cmd/*`

---

# PHASE 2 — P0 SECURITY (Fix Immediately)

## A) JWT Drift & Dual Auth Implementations

There are TWO auth paths:

* `internal/middleware/auth.go`
* `internal/server/server.go` (AuthRequired)

You must:

* Audit both
* Unify into ONE canonical auth flow
* Enforce algorithm validation
* Validate registered claims properly
* Handle missing/invalid `sub`
* Prevent error detail leakage
* Add comprehensive tests

---

## B) WebSocket Ticket Hardening

Audit:

* TTL set at creation
* Single-use redemption
* Atomic delete behavior
* Origin validation
* Max message size
* Heartbeat/ping handling

Add tests covering:

* Valid ticket
* Expired ticket
* Reused ticket
* Missing ticket

---

## C) CORS & Rate Limiting

Audit:

* `AllowCredentials`
* Default origins
* Production configuration safety
* Preflight requests not rate limited
* Rate limit key correctness behind proxies
* Redis-backed limiter safety

Add tests.

---

## D) Authorization / IDOR

Audit all routes using `/:id`.

Ensure:

* Ownership enforced
* AdminRequired safe type assertions
* No `.Locals("userID").(uint)` panics

Add at least 3 authorization tests proving protections.

---

# PHASE 3 — P1 DATABASE & REDIS

## Database (GORM + Postgres)

Audit:

* Pool config:

  * SetMaxOpenConns
  * SetMaxIdleConns
  * SetConnMaxLifetime
  * Add SetConnMaxIdleTime
* Ensure configurable via env
* Ensure readiness uses PingContext
* Ensure consistent `db.WithContext(ctx)`
* Remove reliance on AutoMigrate in production
* Audit manual ALTER TABLE logic

Add migration safety improvements if needed.

---

## Redis

Audit:

* Timeouts
* Context usage
* Retry behavior
* Key naming
* TTL discipline

Add tests using `miniredis`.

---

# PHASE 4 — Observability

Audit and implement:

* Structured logging with request ID
* Secret redaction helper
* Centralized error handler using models/errors.go
* Protect `/metrics` in production
* Add:

  * `/live`
  * `/ready` (db + redis check)
* Verify graceful shutdown:

  * Stop accepting connections
  * Drain in-flight
  * Close DB pool
  * Close Redis

Optional but valuable:

* Minimal OpenTelemetry spans

---

# PHASE 5 — Performance & Reliability

Audit:

* N+1 queries
* Unstable pagination
* Large memory loads
* Outbound HTTP client timeouts
* Goroutine leaks
* Context cancellation propagation

Add improvements with patches.

---

# PHASE 6 — Testing & CI Hardening

You must add:

* 2 JWT edge case tests
* 2 IDOR tests
* 2 rate limit tests
* 2 WebSocket ticket tests
* 1 repository behavior test
* 2 fuzz tests
* 1 property test

Ensure:

* Tests are deterministic
* No flakiness
* CI runs race detector on auth + middleware packages

---

# DELIVERABLES

You must produce:

## 1) Executive Summary (≤ 1 page)

## 2) Findings Table

| ID | Severity | Area | Evidence | Fix | Patch Status |

Severity:

* P0 = Security / Data Loss
* P1 = Correctness / Reliability
* P2 = Performance / Observability
* P3 = Maintainability

---

## 3) Staged PR Plan

PR1: Auth unification + JWT validation + AdminRequired fix + tests
PR2: WebSocket ticket hardening + WS security + tests
PR3: DB pooling + migration cleanup + Redis safety + tests
PR4: Metrics hardening + error handling consistency + observability
PR5: Test expansion + CI tightening

Each PR must include:

* Commit messages
* Changed files list
* How to run tests locally

---

## 4) Immediate Implementation

You must implement PR1 and PR2 immediately with diffs.

No partial suggestions. Real patches.

---

# Start Procedure

1. Run baseline checks
2. Map architecture
3. Identify P0 issues
4. Implement patches
5. Add tests
6. Produce findings table
7. Produce PR plan

---

If you are unsure about behavior:

Search the codebase.
Do not guess.
Prefer evidence-backed changes.
Instrument before refactor if needed.

---

This is the maximum-depth audit standard.
Proceed.
