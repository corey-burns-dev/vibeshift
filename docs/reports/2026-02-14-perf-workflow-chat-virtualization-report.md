# Task Report: Perf Workflow Stabilization + Chat Virtualization Stress Validation

## Metadata

- Date: 2026-02-14
- Branch: main
- Author/Agent: Codex (GPT-5)
- Scope: Stabilize perf Makefile targets, fix e2e/WS harness reliability, wire TanStack virtualization into chat message list, and validate deploy readiness under stress.

## Summary

- Requested: Review and fix the newly added perf workflow and run stress tests for chat with the new TanStack virtual implementation.
- Delivered: Implemented workflow fixes across Makefile, Playwright global setup, WS simulator scripts, and chattest. Added real chat list virtualization (`@tanstack/react-virtual`) to the frontend. Re-ran perf/e2e workloads and captured results.

## Changes Made

- Makefile perf workflow hardening in `Makefile`:
  - Consolidated perf targets/phony declarations.
  - Made `perf-preview` deterministic and strict (fixed `4173`, pid/log lifecycle, no `|| true`).
  - Updated `perf-harness` to point to real route (`/chat`).
  - Fixed `perf-ws` to use a real simulator path (via `perf-multi-ws`).
  - Updated `perf-e2e` and `perf-e2e-local` to `--grep "@preprod"`.
  - Added compose-friendly defaults and `.env` loading for e2e (`PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_URL`, `PGHOST`, `PGPORT`).
- Playwright global setup robustness in `frontend/test/tests/e2e/global-setup.ts`:
  - Updated DB fallback defaults for compose-local runs (`localhost:5432` path with env precedence).
  - Improved DB promotion error diagnostics with connection context.
- WS simulator execution-context and scaling fixes in `scripts/ws-multi-sim.sh`:
  - Corrected `go run` path by executing from backend module root.
  - Preserved binary fallback (`backend/bin/chattest`) when Go is unavailable.
  - Added multi-user sharding (`MAX_CONNS_PER_USER`) to avoid per-user WS cap failures during high client counts.
  - Added better user-creation/login fallback behavior and worker log aggregation.
- chattest protocol/path fixes in `backend/cmd/chattest/main.go`:
  - Default WS path aligned to `/api/ws/chat`.
  - Added conversation setup flow and valid chat WS payloads (`join` + `message` with `conversation_id`).
- Frontend virtualization implementation:
  - `frontend/src/components/chat/MessageList.tsx`: integrated `useVirtualizer` and conditional virtualization for larger message sets.
  - `frontend/src/pages/Chat.tsx`: passed concrete scroll container reference to message list (`scrollElement`).
- E2E suite stabilization:
  - `frontend/test/tests/e2e/stress-journeys.spec.ts` adjusted to stable/authenticated flow that matches `@preprod` suite expectations.

## Validation

- Commands run:
  - `make perf-e2e`
  - `make perf-ws CLIENTS=120 DURATION=30s`
  - `make perf-preview`
  - `make perf-harness`
  - Frontend sanity checks during implementation:
    - `cd frontend && bun run test:run src/components/chat/MessageList.test.tsx`
    - `cd frontend && bun run build`
- Test results:
  - `make perf-e2e`: passed (`2 passed`, chromium).
  - `make perf-ws CLIENTS=120 DURATION=30s`: successful aggregate run:
    - Connections Attempted: 120
    - Connections Successful: 120
    - Connections Failed: 0
    - Messages Sent: 720
    - Messages Received: 8518
    - Total Errors: 0
  - `make perf-preview`: started successfully on `http://localhost:4173` with pid/log files in `/tmp`.
  - `make perf-harness`: printed `Open http://localhost:4173/chat`.
- Manual verification:
  - Confirmed chat virtualization hooks are present and wired (`useVirtualizer`, `scrollElement` pass-through).

## Findings

- Primary breakages in the original perf workflow were real and fixed:
  - Invalid/missing simulator path in `perf-ws`.
  - Wrong Go module execution context in WS simulator.
  - Non-deterministic and failure-masking preview target.
  - E2E grep targeting tests that did not match current suite.
  - Harness docs targeting non-existent frontend route.
- Stress reliability bottleneck observed under load:
  - Backend per-user WS connection limits caused failures when many clients used one account.
  - Resolved by distributing client load across generated users in simulator script.
- Environment caveat detected during repeated heavy runs:
  - Intermittent backend dev-container rebuild/toolchain instability (Go version mismatch symptoms) can cause transient API failures unrelated to harness logic.

## Risks and Regressions

- Known risks:
  - If backend per-user WS limits are tightened further, simulator defaults may require `MAX_CONNS_PER_USER` adjustment.
  - Local environment drift (old containers/toolchains) can reintroduce flaky behavior even when workflow code is correct.
- Potential regressions:
  - Future route or WS contract changes may require chattest payload/path updates.
  - If chat UI scroll container structure changes, virtualization `scrollElement` wiring should be re-verified.
- Mitigations:
  - Recreate backend container before final perf pass to ensure correct Go toolchain image.
  - Keep `perf-e2e` aligned to maintained tags (`@preprod`) and update only when test taxonomy changes.

## Follow-ups

- Remaining work:
  - Run one final pre-deploy validation pass in a freshly recreated backend container.
- Recommended next steps:
  1. `make recreate-backend`
  2. `make perf-ws CLIENTS=120 DURATION=45s`
  3. `make perf-e2e`
  4. Deploy if all three are green.

## Rollback Notes

- Revert safely by restoring prior versions of:
  - `Makefile`
  - `scripts/ws-multi-sim.sh`
  - `backend/cmd/chattest/main.go`
  - `frontend/test/tests/e2e/global-setup.ts`
  - `frontend/test/tests/e2e/stress-journeys.spec.ts`
  - `frontend/src/components/chat/MessageList.tsx`
  - `frontend/src/pages/Chat.tsx`
- If only harness behavior needs rollback, prioritize reverting `Makefile`, `scripts/ws-multi-sim.sh`, and `backend/cmd/chattest/main.go` first.
