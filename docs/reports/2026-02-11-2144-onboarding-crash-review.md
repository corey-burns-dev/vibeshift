# Onboarding Crash Review and Remediation

## Metadata

- Date: `2026-02-11`
- Branch: `current working branch`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Backend + frontend realtime fanout, client containment, auth validation, onboarding guardrails`

## Summary

- Requested: implement a crash-focused review/remediation plan for browser tab crashes after signup/onboarding.
- Delivered: participant-scoped `room_message` fanout, frontend containment for unknown room events, auth token validation hardening, onboarding selection correctness hardening, and regression tests.

## Findings

### High

1. Global group-message fanout to all connected users could trigger event storms and UI pressure under active traffic.
- Evidence:
  - `backend/internal/server/chat_handlers.go` previously broadcast group `room_message` with global fanout.
  - `backend/internal/server/websocket_handlers.go` previously mirrored the same global fanout for WS-originated messages.
- Risk: non-member clients process irrelevant high-volume events, causing cache churn/toast pressure and potential tab instability.
- Status: **Mitigated** (participant-scoped fanout implemented).

### Medium

1. Frontend `room_message` handling treated events like direct conversation messages without membership/known-conversation containment.
- Evidence:
  - `frontend/src/providers/ChatProvider.tsx` handled `message` and `room_message` together and invalidated conversations per event.
  - `frontend/src/components/chat/ChatDock.tsx` incremented unread/toast even when conversation metadata was absent.
- Risk: unread/toast storms and unnecessary query invalidations from irrelevant events.
- Status: **Mitigated** (unknown-room drop + throttled invalidation + ChatDock unknown guard).

2. Session validation used healthcheck rather than an authenticated endpoint.
- Evidence:
  - `frontend/src/hooks/useUsers.ts` previously used `apiClient.healthCheck()` for token validation.
- Risk: false-positive session validity and unnecessary reconnect churn.
- Status: **Mitigated** (`apiClient.getCurrentUser()` now used).

### Low

1. Onboarding submit eligibility counted selected items from local set rather than visible valid slugs.
- Evidence:
  - `frontend/src/pages/OnboardingSanctums.tsx` previously used `selected.size` as submit threshold.
- Risk: edge-case mismatch when selected defaults diverge from visible sanctums.
- Status: **Mitigated** (submit criteria derived from visible chosen slugs).

## Changes Made

### Backend

- Updated group room-message fanout to participant scope:
  - `backend/internal/server/chat_handlers.go`
  - `backend/internal/server/websocket_handlers.go`
- Added regression test for participant-only room broadcast behavior:
  - `backend/internal/notifications/chat_hub_test.go`

### Frontend

- Split and contained message handling:
  - `frontend/src/providers/ChatProvider.tsx`
  - `room_message` now ignored for unknown conversations.
  - Conversation invalidation for `room_message` is throttled.
- Prevented unread/toast updates for unknown conversations:
  - `frontend/src/components/chat/ChatDock.tsx`
- Hardened auth validation endpoint:
  - `frontend/src/hooks/useUsers.ts`
- Fixed onboarding selected-count logic based on visible valid slugs:
  - `frontend/src/pages/OnboardingSanctums.tsx`

### Tests Added/Updated

- `frontend/src/providers/ChatProvider.spec.tsx`
  - Unknown `room_message` ignored.
  - Known `room_message` accepted.
- `frontend/src/components/chat/ChatDock.test.tsx`
  - Unknown conversation does not increment unread or show toast.
  - Known conversation still increments unread and shows toast.
- `frontend/src/pages/OnboardingSanctums.test.tsx`
  - Continue remains disabled when only two visible valid sanctums exist.
- `frontend/src/hooks/useUsers.test.tsx`
  - `useValidateToken` succeeds using authenticated user endpoint.

## Validation

- Commands planned/run:
  - `make test-backend`
  - `make test-frontend`
  - `cd frontend && bun run build`
- Runtime acceptance target:
  - Signup -> onboarding -> continue under active local traffic.
  - Confirm no tab crash and no unread/toast storm for non-member room traffic.

## Residual Risks

- Chat room event volume can still be high for users in many joined rooms; current mitigation is containment + throttle, not full event coalescing.
- Manual runtime validation in Chrome is still required to confirm crash no longer reproduces in your active local profile.

## Follow-ups

1. Add lightweight telemetry counters for dropped unknown `room_message` events and throttle-trigger frequency.
2. Add browser performance baseline capture during onboarding-to-posts transition for regression tracking.
3. Consider batching server-side room presence updates if traffic scales further.
