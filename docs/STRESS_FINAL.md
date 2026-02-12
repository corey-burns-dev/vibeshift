# Production Hardening Stress-Test Plan (Single VM + Compose, Moderate Load, Strict Gate)

## Summary
Build a full pre-prod validation program for auth, posting, commenting, chat, messaging, notifications, and games using your existing open-source stack (Prometheus/Grafana/Loki + CI), with hard pass/fail release gates.  
Current baseline is healthy: `make test-backend`, `make test-frontend`, `make test-backend-integration`, and `go test -tags=load` all pass.

## Important Interface / API / Type Changes
- Add Make interfaces for load/stress workflows:
  - `make test-load`
  - `make test-stress-http`
  - `make test-stress-ws`
  - `make test-soak`
  - `make observability-verify`
- Add load profile config interface:
  - `load/profiles/moderate.json` as the source of truth for VUs, ramp, duration, thresholds.
- Add Prometheus alert rule interface:
  - `infra/prometheus/alerts.yml` and include it from `infra/prometheus/prometheus.yml`.
- Add Grafana dashboard provisioning interface:
  - `infra/grafana/provisioning/dashboards/*.json`.
- No public REST route shape changes required for phase 1.

## Implementation Plan

1. **Stabilize the test entrypoints**
- Add missing `make test-load` target referenced by `backend/TESTING.md`.
- Add separate stress targets that do not rely on ad-hoc commands.
- Fix or replace `backend/cmd/chattest/main.go` so WS load uses the current ticket flow (`POST /api/ws/ticket` + `/api/ws/*?ticket=`).

2. **Complete observability for stress certification**
- Ensure dashboards track: request rate, 4xx/5xx rates, API p95/p99, DB query latency, Redis errors, active WS, WS disconnects, message throughput, backpressure drops, notification event volume, and game action latency.
- Add Prometheus alert rules for release gating:
  - `5xx_rate > 0.5%` over 5m
  - `auth_failure_rate > 1%` over 5m
  - `p95_api_latency > 300ms` over 10m
  - `ws_disconnect_spike` and `ws_backpressure_drops > 0`
  - Redis/db unhealthy signals tied to readiness failures.
- Validate monitoring stack with `make monitor-up` before stress runs.

3. **Implement full stress scenarios (HTTP + WS)**
- Add k6 scenario scripts for:
  - Auth lifecycle: signup/login/refresh/logout.
  - Post/comment lifecycle: create/read/update/delete + likes.
  - Messaging: create conversation, send/read DM, group chat sends.
  - Notifications: WS subscribe, receive event fanout under concurrent writes.
  - Games: create room, join room, move loop, room close/leave.
- Add shared auth/token/ticket utilities in load scripts so WS tests mimic real clients.

4. **Add browser-level concurrency validation**
- Expand Playwright E2E with critical journey specs:
  - Login -> post -> comment -> receive/update notification.
  - Start DM/group message and verify unread/update behavior.
  - Enter game flow and verify state progression for two users.
- Tag suites as `@smoke` and `@preprod` so nightly and pre-release pipelines can select depth.

5. **Add resilience/failure drills during load**
- Add controlled fault scripts for staging:
  - Redis restart during active chat/notifications.
  - App container restart during active sessions.
  - Brief DB unavailability simulation.
- Assert graceful behavior:
  - Readiness flips unhealthy.
  - Error rates recover after dependency recovery.
  - No unrecoverable client loops or stuck sessions.

6. **Wire CI/CD gates**
- Add `stress-pre-release` workflow (manual + pre-release trigger).
- Add nightly stress workflow aligned with your chosen cadence.
- Fail workflow on threshold breach from k6/Prometheus checks.
- Upload artifacts: k6 summary JSON, Playwright report, backend/frontend logs, threshold verdict.

7. **Ship runbook + report process**
- Add `docs/final-testing/stress-test-runbook.md` with exact commands and rollback criteria.
- Add `docs/final-testing/stress-test-report-template.md` for pass/fail signoff.
- Define final go/no-go section with required approvals.

## Test Cases and Scenarios (Must Pass)

1. Auth under load: 100-300 concurrent mixed auth operations, `p95 < 300ms`, auth failures `< 1%`.
2. Feed/post/comment mix: read-heavy + write bursts, `5xx < 0.5%`, no data integrity regressions.
3. Messaging/chat WS: 30-80 concurrent WS clients, message delivery `p95 < 500ms`, no sustained disconnect storm.
4. Notifications fanout: event latency `p95 < 500ms`, unread counts stay consistent after refresh.
5. Game room real-time loop: create/join/move/leave at concurrency, no stuck active rooms or orphaned state.
6. Soak test: 2-hour moderate profile, stable memory/CPU, no increasing error trend.
7. Fault injection runs: service recovery without manual DB repair; readiness/liveness behavior correct.

## Assumptions and Defaults Used
- Production topology: single VM + Docker Compose.
- Test environment: dedicated staging stack.
- Load profile: moderate launch.
- Tooling: open-source local stack (Prometheus/Grafana/Loki + k6 + Playwright).
- Release policy: strict gate.
- Cadence: nightly + pre-release.
- Scope for phase 1: text/social/games. (Video streaming/videochat moved to with-streaming-video branch).
