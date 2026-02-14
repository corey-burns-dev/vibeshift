# ADR-0002: Deterministic WebSocket Handshake Contract

## Decision

Use a deterministic websocket handshake flow with explicit auth validation, bounded fanout behavior, and cleanup guarantees.

## Why

- Prevents handshake loops and duplicate consume behavior.
- Improves reliability under reconnect storms.

## Tradeoffs

- Slightly more state management and validation steps.
- Additional tests required for race-sensitive paths.

## If You Change This, Also Change

- Handshake middleware and ticket consume semantics.
- Frontend reconnect assumptions.
- Realtime incident lessons and known-issues records.
