# Stress Testing Guide

> **Note:** This document was consolidated from `STRESS_TESTING_GUIDE.md` and `STRESS_FINAL.md` on 2026-02-12.

This guide provides comprehensive stress testing and production hardening workflows for Sanctum. It covers execution, monitoring, failure drills, and release gates.

---

## 🚀 Quick Start

To run the full suite and verify the system is ready for production:

1. **Prepare the Stack:**
   ```bash
   make monitor-up  # Start Prometheus, Grafana, Loki
   make up          # Start App, DB, Redis
   make seed        # Seed with test data
   ```

2. **Verify Observability Health:**
   ```bash
   make observability-verify
   ```

3. **Run the Tests:**
   ```bash
   make test-stress-http  # 5-minute HTTP ramp-up
   make test-stress-ws    # WebSocket connection/message stress
   ./scripts/fault-injection.sh  # Resilience drill (Redis/DB/App restarts)
   ```

---

## 🤖 AI-Assisted Pipeline

The repository now supports a Makefile-first AI stress reporting flow:

```bash
make stress-ai-low
make stress-ai-medium
make stress-ai-high
make stress-ai-extreme
make stress-ai-insane
```

Each run will:

1. Start the app + monitoring stack (`make up`, `make monitor-up`).
2. Execute a mixed social stress profile (`load/scripts/social_mixed.js`).
3. Persist run artifacts to `tmp/stress-runs/<timestamp>-<profile>/`.
4. Query Prometheus + Loki and send structured context to local Ollama.
5. Generate `ai-analysis.json`, `report.html`, `report.md`, and `report.txt` in the run folder.

**Load-test design (realistic user simulation)**  
Profiles use **many concurrent users** (VUs) with **human-like pacing**: each virtual user waits 10–30 seconds between actions so that per-user rate limits (e.g. 1 comment/min, 10 posts/5 min) are not hit. Total load is increased by adding more users, not by having each user blast the API. That way certification runs measure **system capacity** (throughput, latency, DB/Redis) rather than rate-limit policy. If you still see 429s under these profiles, the AI report will call that out (see **Rate Limit Signals** below).

To execute all five profiles with an index page:

```bash
make stress-all
```

---

## 📊 Monitoring & Observability

### Grafana Dashboards

Access Grafana at: **`http://localhost:3000`** (Default login: `admin/admin`)

**Dashboard: "Stress Certification"**

This is your primary view during a stress test. Monitor:

* **Request Rate:** Should match the k6 ramp-up profile
* **Error Rate (5xx):** Must remain below **0.5%**
* **P95 Latency:** Watch for spikes above **300ms**
* **Active WebSockets:** Should scale linearly with the WS stress test
* **Database Query Latency:** P95/P99 tracking
* **Redis Errors:** Connection failures and operation errors
* **Message Throughput:** Messages per second across rooms
* **Notification Event Volume:** Event fanout tracking
* **Game Action Latency:** Game move/state update timing

**Dashboard: "API Endpoints Overview"**

Auto-provisioned and endpoint-focused:

* Top endpoints by request rate
* Top 5xx endpoints
* P95 latency by endpoint
* Request rate by status code
* Endpoint hit count table

### Prometheus Alerts

Access Prometheus UI at: **`http://localhost:9090`**

Critical alerts defined in `infra/prometheus/alerts.yml`:

* **`HighErrorRate`**: Triggered if 5xx > 0.5% for 5 minutes
* **`HighLatencyP95`**: Triggered if P95 > 300ms for 10 minutes
* **`WebSocketBackpressure`**: Triggered immediately if messages are dropped
* **`HighAuthFailureRate`**: Triggered if login failures exceed 1%
* **`WebSocketDisconnectSpike`**: Triggered on abnormal disconnect rates
* **`DatabaseUnhealthy`**: Tied to readiness probe failures
* **`RedisUnhealthy`**: Connection failure detection

### Redis Quick Checks (`redli`)

Use `redli` for fast Redis sanity checks during stress runs (see canonical ops standard: [`production-readiness.md#redis-cli-standard-redli`](production-readiness.md#redis-cli-standard-redli)).

```bash
redli -h localhost -p 6379 PING
redli -h localhost -p 6379 INFO server
redli -h localhost -p 6379 SCAN 0 MATCH 'ws_ticket:*' COUNT 20
```

---

## 🧪 Test Scenarios

### 1. HTTP Stress Test (`make test-stress-http`)

Uses `load/scripts/http_stress.js`.

**Profile:** Ramps up to 100+ virtual users (VUs)

**Flow:**
- User signup/login
- Get feed
- Get notifications
- Create random posts
- Create comments
- Like posts

**Validation:**
- Checks for 200/201 status codes
- Token validity
- Response time thresholds
- Data integrity

**Pass Criteria:**
- P95 latency < 300ms
- 5xx error rate < 0.5%
- Auth failures < 1%

### 2. WebSocket Stress Test (`make test-stress-ws`)

Uses `load/scripts/ws_stress.js`.

**Flow:**
- Acquire short-lived ticket via `POST /api/ws/ticket`
- Connect to `/ws/:roomId?ticket=<token>`
- Periodic pings to maintain connection
- Send/receive messages
- Handle broadcasts

**Focus:**
- Ticket issuance throughput
- Connection stability
- Message delivery latency
- Concurrent connection handling

**Pass Criteria:**
- Message delivery P95 < 500ms
- No sustained disconnect storms
- Zero backpressure drops

### 3. Soak Test (`make test-soak`)

A 2-hour moderate load test to identify memory leaks or slow performance degradation.

**Profile:**
- Sustained moderate load (defined in `load/profiles/moderate.json`)
- Mix of all API operations
- Long-running WebSocket connections

**Pass Criteria:**
- Stable memory usage (no continuous growth)
- Stable CPU usage
- No increasing error trend
- P95 latency remains consistent throughout

### 4. Auth Lifecycle Test

**Scenarios:**
- Concurrent signup operations (100-300 users)
- Login/logout cycles
- Token refresh operations
- Session validation

**Pass Criteria:**
- P95 < 300ms
- Auth failures < 1%
- No token leakage or validation errors

### 5. Messaging & Chat Stress

**Scenarios:**
- Create conversations (DM + group)
- Send/read messages concurrently
- Group chat broadcasts
- 30-80 concurrent WebSocket clients

**Pass Criteria:**
- Message delivery P95 < 500ms
- Unread counts remain consistent
- No message loss

### 6. Notifications Fanout

**Scenarios:**
- WebSocket subscribe
- Concurrent write operations triggering notifications
- Event fanout to multiple subscribers

**Pass Criteria:**
- Event latency P95 < 500ms
- All subscribers receive events
- Unread counts stay consistent after refresh

### 7. Game Room Real-Time Loop

**Scenarios:**
- Create/join game rooms
- Concurrent move operations
- Room state synchronization
- Leave/close operations

**Pass Criteria:**
- No stuck active rooms
- No orphaned state
- Move latency acceptable
- State consistency across clients

---

## 🛡️ Resilience & Fault Injection

Run `./scripts/fault-injection.sh` to simulate real-world failures.

### Failure Scenarios

1. **Redis Restart**
   - Verifies app reconnects to Redis without crashing
   - Sessions/cache recover properly
   - WebSocket connections handle Redis unavailability

2. **App Container Restart**
   - Verifies container recovers successfully
   - Health checks pass (`/health/ready`, `/health/live`)
   - Active connections re-establish

3. **Database Pause/Unpause**
   - Simulates brief network partition or DB failover
   - App handles DB unavailability gracefully
   - Queries resume after recovery

### Expected Behavior

**During Failure:**
- Readiness probe returns unhealthy
- Error rates may spike temporarily
- Circuit breakers engage (if implemented)

**After Recovery:**
- App `/health` endpoint returns `UP` within 30 seconds
- Error rates return to baseline
- No stuck sessions or unrecoverable client loops
- Metrics show normal operation

---

## 🤖 CI/CD Integration

The workflow is automated in `.github/workflows/stress-pre-release.yml`.

**Triggers:**
- Manual dispatch
- On new version tags (`v*`)
- Nightly scheduled runs

**Workflow Steps:**
1. Start monitoring stack
2. Start application stack
3. Verify observability
4. Run HTTP stress tests
5. Run WebSocket stress tests
6. Run soak tests
7. Execute fault injection drills
8. Collect artifacts
9. Evaluate pass/fail criteria

**Artifacts:**
- k6 results summary (JSON)
- Playwright test reports
- Backend/frontend logs
- Prometheus alert status
- Threshold verdict report

**Gate:**
- Any threshold breach (defined in `load/profiles/moderate.json`) will fail the build
- Any Prometheus critical alert will fail the build

---

## 📝 Configuration & Interfaces

### Make Targets

Available stress testing commands:

```bash
make test-load              # General load testing
make test-stress-http       # HTTP-focused stress test
make test-stress-ws         # WebSocket-focused stress test
make test-soak              # Long-running soak test
make observability-verify   # Verify monitoring stack health
make monitor-up             # Start Prometheus/Grafana/Loki
make stress-stack-up        # Start app + monitoring + health verification
make stress-low             # Mixed low-profile run (k6 summary artifact)
make stress-medium          # Mixed medium-profile run
make stress-high            # Mixed high-profile run
make stress-extreme         # Mixed extreme-profile run (Hacker News / Trending)
make stress-insane          # Mixed insane-profile run (The "Bomb")
make ai-report              # Generate AI report for latest run
make stress-ai-medium       # End-to-end medium run + AI report
make stress-ai-high         # End-to-end high run + AI report
make stress-ai-extreme      # End-to-end extreme run + AI report
make stress-ai-insane       # End-to-end insane run + AI report
make stress-all             # Run all profiles with AI reports + index
make stress-index           # Build tmp/stress-runs/index.html
```

### Load Profile Configuration

**Files:** `load/profiles/low.json`, `load/profiles/medium.json`, `load/profiles/high.json`, `load/profiles/extreme.json`, `load/profiles/insane.json`

Source of truth for:
- Virtual users (VUs)
- Ramp-up duration
- Test duration
- Thresholds
- Scenarios

### Runtime Environment Variables

Defaults used by the stress + AI pipeline:

- `BASE_URL=http://localhost:8375`
- `OLLAMA_URL=http://localhost:11434`
- `OLLAMA_MODEL=llama3.2:3b`
- `PROM_URL=http://localhost:9090`
- `LOKI_URL=http://localhost:3100`
- `ARTIFACT_DIR=tmp/stress-runs`

#### Interpreting results: throughput vs rate limits

- **Throughput bottlenecks:** High latency, 5xx errors, or timeouts under load usually indicate capacity or backend limits (CPU, DB, connections). Address by scaling or optimizing.
- **Policy bottlenecks (429s):** When the app returns **HTTP 429 Too Many Requests**, the limiter is working as configured; the load profile is hitting rate-limit policy. The report’s **Rate Limit Signals** section shows Loki 429 sample count and which write-heavy checks (e.g. create post, comment, friend request, DM send) are failing. Use this to distinguish “system overload” from “rate limit triggered.”
- **Rate Limit Signals (in reports):** In `report.html`, `report.md`, and `report.txt` you’ll see:
  - **Loki 429/rate-limit entry count** — log lines matching `request processed` and `status=429` in the run window.
  - **Critical write checks** — pass rates for the canonical write checks from `social_mixed.js`; pass rate &lt; 20% is treated as severely constrained.
  - **Likely rate-limited endpoints** — endpoints inferred from failing checks (e.g. `POST /api/posts`, `POST /api/posts/:id/comments`).
- **Deterministic status:** The report applies a policy after the AI response. If `http_req_failed` exceeds the profile threshold or any primary write-check pass rate is &lt; 20%, the final status is escalated to `CRITICAL` regardless of the model output.

### Artifact Contract

Every run directory contains:

- `metadata.json` (profile + run window)
- `summary.json` (k6 summary export)
- `metrics.json` (Prometheus query results)
- `logs.json` (Loki excerpts)
- `ai-analysis.json` (structured AI verdict)
- `report.html` (standalone report)
- `report.md` (markdown report)
- `report.txt` (plain-text report)

---

## Troubleshooting (AI Pipeline)

- **Ollama unavailable**: ensure host service is reachable at `OLLAMA_URL`; `ai-report` will fall back to partial report mode if unreachable.
- **Prometheus empty metrics**: confirm app metrics endpoint is scraped (`http://localhost:9090/targets`) and rerun with longer profile duration.
- **Loki missing logs**: verify promtail is running and container log labels are present in Loki.
- **k6 summary missing**: ensure stress command completed and `summary.json` exists in the run directory.
- **429s in Rate Limit Signals**: 429s are sourced from **INFO-level** request logs (e.g. “request processed” with `status=429`). Ensure the app logs HTTP status for each request so Loki can index them; without that, the rate-limit sample count may be zero even when k6 sees 429s.

### Prometheus Configuration

**Alert Rules:** `infra/prometheus/alerts.yml`
**Main Config:** `infra/prometheus/prometheus.yml`

### Grafana Configuration

**Dashboard Provisioning:** `infra/grafana/provisioning/dashboards/*.json`

---

## ✅ Test Case Checklist (Must Pass for Release)

Pre-release validation checklist:

- [ ] **Auth under load:** 100-300 concurrent mixed auth operations, P95 < 300ms, auth failures < 1%
- [ ] **Feed/post/comment mix:** Read-heavy + write bursts, 5xx < 0.5%, no data integrity regressions
- [ ] **Messaging/chat WS:** 30-80 concurrent WS clients, message delivery P95 < 500ms, no sustained disconnect storm
- [ ] **Notifications fanout:** Event latency P95 < 500ms, unread counts stay consistent after refresh
- [ ] **Game room real-time loop:** Create/join/move/leave at concurrency, no stuck active rooms or orphaned state
- [ ] **Soak test:** 2-hour moderate profile, stable memory/CPU, no increasing error trend
- [ ] **Fault injection:** Service recovery without manual DB repair, readiness/liveness behavior correct
- [ ] **No critical Prometheus alerts triggered**
- [ ] **k6 thresholds passed**
- [ ] **P95 latency stable under peak load**

---

## 📋 Reporting & Sign-off

After running the tests, document results using the template at `docs/reports/REPORT_TEMPLATE.md`.

**Required Information:**
- Test execution date/time
- System configuration (versions, resources)
- All threshold results
- Any alerts triggered
- Failure drill outcomes
- Screenshots of dashboards during peak load
- Go/No-Go recommendation

**Sign-off Requirements:**
- Engineering lead approval
- All critical tests passing
- No unresolved critical issues
- Runbook verified and up-to-date

---

## 🏗️ Implementation Notes

### Current Test Coverage Baseline

All tests currently passing:
- `make test-backend`
- `make test-frontend`
- `make test-backend-integration`
- `go test -tags=load`

### Architecture Assumptions

- **Production topology:** Single VM + Docker Compose
- **Test environment:** Dedicated staging stack
- **Load profile:** Moderate launch traffic
- **Tooling:** Open-source local stack (Prometheus/Grafana/Loki + k6 + Playwright)
- **Release policy:** Strict gate (fail on threshold breach)
- **Cadence:** Nightly + pre-release
- **Scope:** Text/social/games (video streaming on separate branch)

### Future Enhancements

1. **Browser-level concurrency validation:**
   - Expand Playwright E2E with critical journey specs
   - Tag suites as `@smoke` and `@preprod` for selective execution

2. **Advanced failure scenarios:**
   - Network partition simulation
   - Gradual performance degradation
   - Cascading failure recovery

3. **Performance baseline tracking:**
   - Historical trend analysis
   - Regression detection
   - Capacity planning metrics

---

## 📚 Related Documentation

- **Test Matrix:** `/docs/testing/sanctum-test-matrix.md`
- **Production Readiness:** `/docs/operations/production-readiness.md`
- **CI Runbook:** `/docs/operations/runbooks/ci-runbook.md`
- **Rollback Runbook:** `/docs/operations/runbooks/rollback-runbook.md`
