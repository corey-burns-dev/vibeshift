# Sanctum Stress-Testing & Hardening Guide

This guide provides a comprehensive overview of the production hardening workflow. It covers how to execute stress tests, monitor system health using Prometheus and Grafana, and perform failure drills.

## 🚀 Quick Start: The "Whole Shebang"

To run the full suite and verify the system is ready for production:

1.  **Prepare the Stack:**
    ```bash
    make monitor-up  # Start Prometheus, Grafana, Loki
    make up          # Start App, DB, Redis
    make seed        # Seed with test data
    ```

2.  **Verify Observability Health:**
    ```bash
    make observability-verify
    ```

3.  **Run the Tests:**
    ```bash
    make test-stress-http  # 5-minute HTTP ramp-up
    make test-stress-ws    # WebSocket connection/message stress
    ./scripts/fault-injection.sh  # Resilience drill (Redis/DB/App restarts)
    ```

---

## 📊 Monitoring Guide

### Grafana Dashboards
Access Grafana at: **`http://localhost:3000`** (Default login: `admin/admin`)

**Dashboard: "Stress Certification"**
This is your primary view during a stress test. Look for:
*   **Request Rate:** Should match the k6 ramp-up profile.
*   **Error Rate (5xx):** Must remain below **0.5%**.
*   **P95 Latency:** Watch for spikes above **300ms**.
*   **Active WebSockets:** Should scale linearly with the WS stress test.

### Prometheus Alerts
Access Prometheus UI at: **`http://localhost:9090`**

Critical alerts defined in `infra/prometheus/alerts.yml`:
*   `HighErrorRate`: Triggered if 5xx > 0.5% for 5 minutes.
*   `HighLatencyP95`: Triggered if P95 > 300ms for 10 minutes.
*   `WebSocketBackpressure`: Triggered immediately if messages are dropped.
*   `HighAuthFailureRate`: Triggered if login failures exceed 1%.

---

## 🧪 Detailed Test Scenarios

### 1. HTTP Stress (`make test-stress-http`)
Uses `load/scripts/http_stress.js`.
*   **Profile:** Ramps up to 100+ VUs.
*   **Flow:** Login -> Get Feed -> Get Notifications -> Create Random Posts.
*   **Validation:** Checks for 200/201 status codes and token validity.

### 2. WebSocket Stress (`make test-stress-ws`)
Uses `load/scripts/ws_stress.js`.
*   **Flow:** Acquires a short-lived ticket via `POST /api/ws/ticket` -> Connects to `/ws/1` -> Periodic pings.
*   **Focus:** Tests ticket issuance throughput and connection stability.

### 3. Soak Testing (`make test-soak`)
A 2-hour moderate load test to identify memory leaks or slow performance degradation.
*   **Run command:** `make test-soak`

---

## 🛡️ Resilience & Fault Injection

Run `./scripts/fault-injection.sh` to simulate real-world failures:

1.  **Redis Restart:** Verifies that the app reconnects to Redis without crashing and that sessions/cache recover.
2.  **App Restart:** Verifies that the container recovers and passes health checks (`/health/ready`).
3.  **DB Pause/Unpause:** Simulates brief network partition or DB failover.

**Success Criteria:** The app's `/health` endpoint must return `UP` within 30 seconds of dependency recovery.

---

## 🤖 CI/CD Integration

The workflow is automated in `.github/workflows/stress-pre-release.yml`.
*   **Trigger:** Manual dispatch or on new Version Tags (`v*`).
*   **Artifacts:** k6 results and logs are uploaded for every run.
*   **Gate:** Any threshold breach (defined in `load/profiles/moderate.json`) will fail the build.

---

## 📝 Reporting & Sign-off

After running the tests, use the template at `docs/final-testing/stress-test-report-template.md` to document the results. 

**Required for Go-Live:**
- [ ] No critical Prometheus alerts triggered.
- [ ] k6 thresholds passed.
- [ ] Fault injection recovery verified.
- [ ] P95 latency stable under peak load.
