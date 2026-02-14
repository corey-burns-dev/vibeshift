# Performance Audit Plan (Focused, Measured, Backend-First)

## Summary

Run a focused, evidence-based performance audit using existing stress artifacts plus one fresh medium-profile validation run, then deliver findings and a concrete implementation plan for the single highest-impact low-risk fix.  
Scope is backend-first, with frontend checks for refetch/realtime side effects.

## Goals and Success Criteria

1. Produce baseline metrics for one recent run and one fresh run:
   - `http_req_duration p95`
   - `http_req_failed rate`
   - `checks pass rate`
   - endpoint-level failure concentration (especially write paths)
2. Identify top bottlenecks ranked by impact/risk (2–5 candidates).
3. Select one low-risk bottleneck as the immediate fix target and provide decision-complete implementation steps.
4. Define re-measurement criteria showing expected/acceptable delta after the fix.
5. Keep scope safe:
   - no schema changes
   - no new dependencies
   - no behavior-breaking API contract changes

## Non-Mutating Audit Execution Plan

1. Baseline from existing artifacts:
   - Primary source: latest stable medium/high artifacts under `tmp/stress-runs/*`.
   - Extract k6 + AI report metrics from `summary.json`, `ai-analysis.json`, and `report.md`.
   - Build a compact baseline table per run.
2. Fresh validation run (medium profile):
   - Bring stress app stack up if not running.
   - Execute `make stress-medium` and `make ai-report`.
   - Capture produced artifact directory and metric summary.
3. Backend hotspot inspection (targeted):
   - Analyze post feed path:
     - `backend/internal/service/post_service.go`
     - `backend/internal/repository/post.go`
   - Analyze chat/conversation/message path:
     - `backend/internal/service/chat_service.go`
     - `backend/internal/repository/chat.go`
   - Correlate rate-limit behavior from:
     - `backend/internal/server/server.go`
     - `backend/internal/middleware/ratelimit.go`
4. Frontend side-effect inspection (supporting):
   - Review websocket/query invalidation patterns:
     - `frontend/src/providers/ChatProvider.tsx`
     - `frontend/src/pages/Chat.tsx`
     - `frontend/src/utils/prefetch.ts`
     - `frontend/src/main.tsx`
5. Bottleneck ranking:
   - Rank by measured impact, fix risk, and verification ease.
   - Select top low-risk option for implementation plan.

## Initial Candidate Bottlenecks to Validate

1. Potential N+1 liked-status enrichment on cached post feed for authenticated users (`PostService.ListPosts` path calling `IsLiked` per post).
2. Chat query invalidation/refetch churn risk due mixed query-key usage and websocket event invalidations.
3. Write-endpoint failure concentration potentially tied to policy/rate-limiting behavior vs true backend saturation (must distinguish with logs + environment config).

## Planned Deliverables

1. **Audit Findings Report** (structured):
   - Baseline metrics
   - suspected bottlenecks with evidence
   - ranked candidate improvements (impact vs risk)
2. **Top Fix Implementation Spec** (decision-complete):
   - exact files/functions to modify
   - algorithm/query approach
   - invariants/behavior preservation constraints
   - verification commands and expected deltas

## Public APIs / Interfaces / Types

1. Default target: **no public API changes** (routes, response shapes unchanged).
2. If top fix requires internal contract updates, limit to internal repository/service interfaces only and document exact signature changes.
3. No schema/migration changes unless explicitly re-scoped.

## Verification and Test Scenarios

1. Performance verification:
   - Re-run `make stress-medium` + `make ai-report`.
   - Compare pre/post for:
     - `http_req_duration p95`
     - `http_req_failed rate`
     - check pass rate
     - targeted endpoint error reduction
2. Functional regression checks:
   - backend tests: `make test-backend` (or project-standard backend test target)
   - frontend tests for touched realtime/query behavior: `make test-frontend` (targeted subsets allowed first)
3. Acceptance thresholds for top fix:
   - measurable improvement on chosen hotspot metric
   - no increase in failed checks
   - no route/status/shape regressions

## Assumptions and Defaults

1. Audit depth: **Focused measured audit** (chosen).
2. Priority: **Backend API first** (chosen).
3. Deliverable mode: **Findings + top fix plan** (chosen).
4. Existing dirty worktree is unrelated context; changes from this effort must stay isolated.
5. Performance work remains low-risk and behavior-preserving unless scope is explicitly expanded.
