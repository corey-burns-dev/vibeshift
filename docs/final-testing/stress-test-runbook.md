# Production Hardening Stress-Test Runbook

## Overview
This runbook describes how to execute and validate the production hardening stress-test program for Sanctum.

## Prerequisites
- Docker and Docker Compose
- k6 installed locally (`brew install k6` or equivalent)
- `make` toolchain
- Access to the environment where Sanctum is running

## Execution Steps

### 1. Initialize Environment
```bash
make monitor-up
make up
make seed
```

### 2. Verify Observability
```bash
make observability-verify
```
Ensure Grafana is accessible at `http://localhost:3000` and the "Stress Certification" dashboard is present.

### 3. Run Stress Scenarios
Run the HTTP stress test:
```bash
make test-stress-http
```

Run the WebSocket stress test:
```bash
make test-stress-ws
```

### 4. Run Fault Injection
```bash
./scripts/fault-injection.sh
```

### 5. (Optional) Run Soak Test
For pre-release final validation, run a 2-hour soak test:
```bash
make test-soak
```

## Pass/Fail Criteria
- **5xx rate < 0.5%**
- **Auth failure rate < 1%** (excluding intentional invalid attempts)
- **P95 latency < 300ms**
- **Zero WebSocket message drops** due to backpressure
- **Successful recovery** from all fault injection scenarios

## Rollback Criteria
If any of the "critical" alerts in Prometheus are triggered during the stress test, the current build is considered unstable and should not be promoted to production.
Refer to `infra/prometheus/alerts.yml` for alert definitions.
