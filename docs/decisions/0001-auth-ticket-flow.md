# ADR-0001: Auth Ticket Flow For WebSocket Handshake

## Decision

WebSocket authentication uses short-lived single-use tickets instead of long-lived auth tokens in URL query strings.

## Why

- Reduces credential exposure risk in logs and intermediaries.
- Limits replay risk window.

## Tradeoffs

- Adds ticket issuance/validation complexity.
- Requires tight coordination between auth and websocket handlers.

## If You Change This, Also Change

- Ticket issuance endpoint and TTL policy.
- Ticket consume path in websocket handshake.
- Client reconnect/auth-refresh logic.
- Security and incident docs in `docs/context/auth-and-security.md`.
