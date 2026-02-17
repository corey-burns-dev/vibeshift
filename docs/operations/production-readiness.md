# Production Readiness Guide

> **Note:** This document was consolidated from `production_ready_at_scale_checklist.md`, `FIXES.md`, and `fixbackend.md` on 2026-02-12.

This guide covers everything needed to take Sanctum from a solid full-stack project to production-ready at scale, including reliability requirements, known issues and their fixes, and architectural improvements.

---

## 🚨 Tier 1: Non-Negotiables (Before Scale)

These are critical. Skipping them will cause outages, data issues, or painful debugging once real users arrive.

---

### 1. Observability (Critical)

You need to be able to answer *"What is broken, where, and why?"* in minutes.

#### Logging

- Use structured (JSON) logs everywhere
- Include consistently:
  - `request_id` / `trace_id`
  - `user_id` (when available)
  - endpoint / method
  - status code
  - latency

#### Metrics

At minimum:

- Requests per endpoint
- Error rate per endpoint
- P95 / P99 latency
- Active WebSocket connections
- Redis and database error rates

#### Tracing

- Distributed tracing across:
  - HTTP → DB → Redis → WebSocket
- Especially important for chat and feed flows

---

### 2. Database Scaling & Safety

#### Indexing

- Audit every hot-path query:
  - Feeds
  - Chats
  - Notifications
  - Friendship lookups
- Ensure indexes match real query patterns

#### Read / Write Separation

- Prepare for read-heavy traffic
- Design for:
  - Read replicas
  - Explicit read vs write DB routing

#### Migrations

- One migration per PR
- Forward-only migrations
- No destructive auto-migrations in prod
- Validate migration checksums at startup

**Migration Test Correctness:**

- Test file: `backend/test/sanctum_migration_seed_test.go`
- Must use real SQL migrations (`runMigrations`) instead of `runAutoMigrate`
- Validate FK constraints: `fk_conversations_sanctum`
- Validate unique indexes: `idx_conversations_sanctum_id_unique`

---

### 3. Caching Strategy (Intentional, Not Accidental)

Redis should be used with clear rules.

Define explicitly:

- What is cached
- TTLs
- Invalidation strategy
- Behavior on cache miss or failure

Examples:

- Feeds → cached, short TTL
- Presence → Redis-only
- User profiles → read-through cache

**Rule:** The app must continue functioning if Redis is unavailable.

#### Redis CLI Standard: `redli`

Operations docs and runbooks assume `redli` for Redis checks (`redis-cli` replacement).

```bash
redli -h localhost -p 6379 PING
redli -h localhost -p 6379 INFO server
redli -h localhost -p 6379 SCAN 0 MATCH 'ws_ticket:*' COUNT 20
```

---

### 4. WebSockets at Scale

WebSockets are usually the first system to break under load.

#### Required Improvements

- Connection limits per user
- Backpressure handling (drop / queue / reject)
- Heartbeats with server-side enforcement
- Explicit disconnect cleanup

#### Horizontal Scaling

- Never assume a user stays on one instance
- Use Redis pub/sub or a broker abstraction
- Sticky sessions or shared state where required

---

### 5. Authentication & Security Hardening

Assume hostile traffic.

Add:

- Rate limiting (auth, posts, chat)
- JWT expiration + refresh strategy
- Token revocation support
- Payload size limits
- Audit logs for sensitive actions

---

## ⚙️ Tier 2: Scale-Ready Architecture

These changes prevent future rewrites.

---

### 6. API Contracts as First-Class Artifacts

Backend and frontend will not always evolve together.

- OpenAPI as source of truth
- Generate:
  - Backend validation
  - Frontend client + types
- Enforce backward compatibility

---

### 7. Background Jobs & Async Processing

Move non-critical work out of request paths:

- Notifications
- Feed fan-out
- Analytics events
- Email / push notifications

Benefits:

- Lower latency
- Better fault isolation

---

### 8. Stronger Domain Boundaries

#### Backend Layering

- Handlers → I/O only
- Services → business rules
- Repositories → persistence only

Handlers should contain almost no logic.

---

### 9. Configuration & Secrets

Misconfiguration causes outages.

- Validate config at startup
- Fail fast on missing env vars
- Secrets from a secret manager
- Environment-specific defaults

---

## 🧪 Tier 3: Reliability & Safety Nets

These save you during incidents.

---

### 10. Testing Strategy (Quality > Quantity)

Prioritize:

- API contract tests
- Critical-path integration tests
- Load tests for:
  - Feed
  - Chat send
  - Login

Run backend tests with race detection enabled.

**Test Infrastructure Health:**

- `make test-backend` must pass
- `make test-backend-integration` must pass
- `make test-frontend` must pass
- `make test-api` must be functional

---

### 11. Feature Flags

You will need to:

- Gradually roll out features
- Disable broken functionality instantly

Add a simple feature flag system early.

---

### 12. Deployments & Rollbacks

Required for confidence at scale:

- Zero-downtime deploys
- Health checks
- Readiness vs liveness probes
- Fast rollback strategy

The system should survive:

- Partial deploys
- Redis restarts
- DB slowdowns

---

## 🧠 Tier 4: People & Process

Often overlooked, always painful if missing.

---

### 13. Operational Runbooks

Document:

- How to debug slow feeds
- How to restart chat safely
- How to handle database incidents

See: [operations/runbooks/](runbooks/)

---

### 14. Ownership & On-Call Thinking

Ask regularly:
> "If this breaks at 100k users, where do I look first?"

If the answer is unclear, add visibility there.

---

## 🔧 Known Issues & Fixes

### Critical: Production Frontend → API/WS Routing

**Issue:** Production frontend cannot reliably reach API/WS through current container routing.

**Root Causes:**

1. `frontend/nginx.conf:1` only proxies `/health`, not `/api` or WS upgrade headers
2. `compose.yml:53` does not expose backend port publicly
3. Browser direct calls to `:8375` fail in prod-style deployment

**Fix:**

1. Update `frontend/nginx.conf` to proxy `/api` to `app:8375` with WS upgrade headers
2. Keep `/health` proxy as-is
3. Ensure `/api/ws/*` flows through same proxy

---

### Critical: WS Base URL Construction

**Issue:** WS base URL construction is environment-fragile and breaks in deployed contexts.

**Root Causes:**

1. `frontend/src/lib/chat-utils.ts:85` hardcodes `hostname + VITE_API_PORT|8375`, ignoring `VITE_API_URL`
2. `frontend/src/api/client.ts:50` defaults API to `http://localhost:8375/api`

**Fix:**

1. Change frontend API default from hardcoded localhost to same-origin: `/api`
2. Replace `getWsBaseUrl()` logic to derive WS host from resolved API URL
3. Keep support for explicit `VITE_API_URL` absolute URLs
4. Deprecate `VITE_API_PORT` in runtime WS URL resolution

---

### High: Game WS Duplicate Fanout & Unsafe Multi-Writer

**Issue:** Game WebSocket has duplicate fanout paths and concurrent write risks.

**Root Causes:**

1. `backend/internal/server/game_handlers.go:176` per-connection Redis subscription writes directly to socket
2. `backend/internal/notifications/game_hub.go:102` and `:335` also write to same sockets
3. Creates duplicate events and concurrent write race conditions

**Fix:**

1. Remove per-connection Redis subscribe/write loop from `WebSocketGameHandler`
2. Rely on hub wiring for fanout
3. Ensure serialized writes per game connection (mutex or channel-backed writer)
4. Frontend `useGameRoomSession`: add bounded exponential reconnect (1s → 30s cap, max 8 attempts)

---

### High: Notification WS Reconnect Thrashing

**Issue:** Notification WebSocket reconnect is aggressive with fixed delay, can thrash on auth/network errors.

**Root Causes:**

1. `frontend/src/hooks/useRealtimeNotifications.ts:455` retries every 1500ms with no backoff cap
2. `frontend/src/hooks/useRealtimeNotifications.ts:460` force-closes on `onerror`, feeding reconnect loop

**Fix:**

1. Switch to exponential backoff with jitter (1s base, 30s cap)
2. Reset attempts on successful connection
3. On auth failure while obtaining WS ticket, clear auth and redirect to login once (no reconnect loop)

---

### Medium: Connection Limits Too Low for Multi-Tab

**Issue:** Connection limits are likely too low for multi-tab usage with multiple socket types.

**Root Causes:**

1. `backend/internal/notifications/hub.go:17` `maxConnsPerUser = 5`
2. `backend/internal/notifications/chat_hub.go:61` uses same cap

**Fix:**

1. Increase per-user WS limit from 5 to 12 for chat/notification hubs
2. Add explicit log event when limit is hit
3. Test with 4+ tabs to verify no connection-limit rejection

---

### Medium: Backend Test Workflow Inconsistency

**Issue:** Backend test workflow is inconsistent between host and container execution.

**Root Causes:**

1. `backend/test/api_integration_test.go:25` forces `DB_HOST=postgres_test`
2. Host `go test` cannot resolve this
3. `Dockerfile.test:1` runtime PATH does not include `/usr/local/go/bin`

**Fix:**

1. Remove hardcoded `DB_HOST=postgres_test` override
2. Use config/env inputs instead
3. In `Dockerfile.test`, set PATH to include `/usr/local/go/bin` explicitly
4. Ensure both host-run and container-run are deterministic

---

### Medium: Make Target Correctness

**Issue:** Some Make targets reference missing scripts or are undocumented.

**Fixes:**

1. `make test-api`: Fix to call `./test-routes.sh` (current `./test-api.sh` is missing)
2. `make test-frontend`: Add target (`cd frontend && bun run test:run`)
3. Update `.PHONY` and `help` entries for these corrections

---

## 🔐 WebSocket Security: Ticket Migration

### Current State

Multiple WS auth patterns in use, creating security and reliability issues.

### Target State

Strict ticket-based authentication for all `/api/ws/*` endpoints.

### Migration Plan

**Phase 1: Frontend Changes**

1. Add `apiClient.issueWSTicket()` for `POST /api/ws/ticket`
2. Introduce shared helper to open WS with fresh ticket per connection attempt
3. Migrate all active WS clients to ticket auth:
   - `frontend/src/providers/ChatProvider.tsx`
   - `frontend/src/hooks/useRealtimeNotifications.ts`
   - `frontend/src/hooks/useGameRoomSession.ts`
   - `frontend/src/hooks/useVideoChat.ts`
   - `frontend/src/hooks/useChatWebSocket.ts` (keep functional)

**Phase 2: Backend Enforcement**

1. In `AuthRequired`, for `/api/ws/*`, require valid `ticket`
2. Reject token query auth for WebSocket endpoints
3. Keep existing Bearer auth unchanged for non-WS HTTP routes

**Benefits:**

- No WS auth tokens in URL query strings
- Short-lived tickets reduce exposure window
- Clear separation between HTTP and WS auth

---

## ✅ Production Readiness Checklist

### Pre-Launch Requirements

- [ ] **Observability**: Structured logging, metrics, and tracing in place
- [ ] **Database**: Indexes audited, migrations controlled, read/write separation designed
- [ ] **Caching**: Clear strategy with TTLs and invalidation rules
- [ ] **WebSockets**: Connection limits, backpressure handling, horizontal scaling support
- [ ] **Security**: Rate limiting, JWT strategy, token revocation, audit logs
- [ ] **API Contracts**: OpenAPI as source of truth with validation
- [ ] **Background Jobs**: Non-critical work moved to async processing
- [ ] **Architecture**: Clean handler/service/repository separation
- [ ] **Configuration**: Startup validation, fail-fast on missing config
- [ ] **Testing**: Contract tests, integration tests, load tests passing
- [ ] **Feature Flags**: System in place for gradual rollouts
- [ ] **Deployments**: Zero-downtime deploys, health checks, rollback strategy
- [ ] **Runbooks**: Operational documentation for common incidents
- [ ] **Monitoring**: Dashboards and alerts for production metrics

### Known Issues Resolved

- [ ] Frontend nginx.conf proxies `/api` with WS upgrade headers
- [ ] WS base URL construction uses same-origin strategy
- [ ] Game WS fanout deduplicated with serialized writes
- [ ] Notification WS reconnect uses exponential backoff
- [ ] Connection limits increased to support multi-tab usage
- [ ] Backend test workflow consistent between host and container
- [ ] Make targets functional and documented
- [ ] WS ticket authentication migrated for all endpoints

---

## 📚 Related Documentation

- **Stress Testing:** [operations/stress-testing.md](stress-testing.md)

- **CI Runbook:** [operations/runbooks/ci-runbook.md](runbooks/ci-runbook.md)
- **Rollback Runbook:** [operations/runbooks/rollback-runbook.md](runbooks/rollback-runbook.md)
- **Feature Wishlist:** [features/feature-wishlist.md](../features/feature-wishlist.md)
- **Test Matrix:** [testing/sanctum-test-matrix.md](../testing/sanctum-test-matrix.md)

---

## 🏗️ Historical Context

### Database-Caching Branch Merge (Completed)

A selective patch strategy was used to merge validated changes from the `database-caching` orphan branch into `master`.

**What Was Ported:**

- Fix for `make test-api` target to call existing `test-routes.sh`
- Addition of `make test-frontend` target
- Migration test correctness fixes in `sanctum_migration_seed_test.go`

**What Was Not Ported:**

- Test pipeline behavior rewrites
- Formatter policy changes
- Server wiring changes (kept current `internal/bootstrap` + `NewServerWithDeps` pattern)

**Rationale:** Avoided merging unrelated histories, preserved current runtime architecture, captured concrete value while minimizing regression risk.

---

## 🏁 Summary

To be production-ready at scale, the biggest mindset shifts are:

- **Observability over cleverness**
- **Predictability over raw speed**
- **Boring infrastructure over fragile optimizations**

Your current app is already well-built. These changes are about **surviving success**.
