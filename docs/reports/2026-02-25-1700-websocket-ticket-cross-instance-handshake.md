# Task Report

## Metadata

- Date: `2026-02-25`
- Branch: `main`
- Author/Agent: `Codex (GPT-5)`
- Scope: `backend websocket auth ticket handshake reliability in deployed multi-instance environments`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["backend", "websocket", "auth", "redis"],
  "Lessons": [
    {
      "title": "In-process handshake cache is insufficient behind load balancers",
      "severity": "HIGH",
      "anti_pattern": "Caching consumed websocket tickets only in local process memory",
      "detection": "rg -n \"consumedTickets|GetDel\" backend/internal/server/server.go",
      "prevention": "Mirror short-lived consumed-ticket state to Redis so websocket multi-pass auth survives cross-instance routing."
    },
    {
      "title": "Handshake retry cache must be explicitly cleaned",
      "severity": "MEDIUM",
      "anti_pattern": "Leaving consumed handshake markers until TTL expiry after successful upgrade",
      "detection": "rg -n \"consumeWSTicket\" backend/internal/server",
      "prevention": "Clear both in-process and Redis consumed-ticket caches when the websocket handler confirms establishment."
    }
  ]
}
```

## Summary

- Requested: investigate deployed websocket instability (session validation/presence symptoms) and harden websocket behavior.
- Delivered: made websocket ticket multi-pass authentication resilient across instances by adding a short-lived Redis consumed-ticket cache in addition to in-process cache, and added regression tests.

## Changes Made

- Backend auth middleware (`backend/internal/server/server.go`):
  - Added shared consumed-ticket cache constants:
    - `wsConsumedTicketTTL`
    - `wsConsumedTicketSweepTTL`
    - `wsConsumedTicketKeyPrefix`
  - Added helper key builders:
    - `wsTicketKey(ticket)`
    - `wsConsumedTicketKey(ticket)`
  - On successful `GETDEL` ticket validation, now caches consumed ticket in:
    - in-process map (existing behavior)
    - Redis consumed-ticket key with short TTL (new behavior)
  - On `GETDEL` miss, now validates from:
    - in-process consumed cache
    - Redis consumed cache (new behavior)
- Ticket cleanup (`consumeWSTicket` in `server.go`):
  - Now removes consumed ticket from both in-process map and Redis consumed key.
- Tests (`backend/internal/server/ws_ticket_test.go`):
  - Refactored app setup into `newAuthRequiredTestApp` helper.
  - Added assertion that consumed ticket is cached in Redis after first pass.
  - Added cross-instance test where second pass succeeds on a different server instance via Redis consumed cache.
  - Added test verifying `consumeWSTicket` clears Redis consumed cache.

## Validation

- Commands run:
  - `cd backend && go test ./internal/server -run 'TestAuthRequired_WSTicket|TestServer_ConsumeWSTicket' -count=1`
  - `cd backend && go test ./internal/server -count=1`
  - `make test-backend`
- Test results:
  - Focused websocket ticket tests passed.
  - Full `internal/server` package tests passed.
  - Full backend suite passed.
- Manual verification:
  - Browser/manual deploy verification not run in this session.

## Risks and Regressions

- Known risks:
  - Redis consumed-ticket marker introduces a short retry window; if Redis is unavailable during cache write, behavior falls back to in-process only.
- Potential regressions:
  - Slightly more Redis operations on websocket auth path.
- Mitigations:
  - TTL is short (10s).
  - Cleanup path now removes markers immediately after successful upgrade.

## Follow-ups

- Remaining work:
  - Validate behavior in deployed multi-replica environment with non-sticky websocket upgrade routing.
- Recommended next steps:
  - Add operational metric/log counter for ticket validation source (`redis`, `in-process`, `redis-consumed`) to make production diagnosis faster.

## Rollback Notes

- Revert:
  - `backend/internal/server/server.go`
  - `backend/internal/server/ws_ticket_test.go`
- Re-run backend test suite after rollback:
  - `make test-backend`
