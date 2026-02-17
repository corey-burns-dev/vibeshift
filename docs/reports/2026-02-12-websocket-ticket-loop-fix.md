# Technical Report: WebSocket Handshake Ticket Consumption Fix

## Metadata

- **Date:** 2026-02-12
- **Author:** Gemini CLI
- **Status:** Completed
- **Scope:** Backend Authentication & WebSocket Handshake

## 1. Problem Summary

The frontend was experiencing a loop of `401 Unauthorized` errors when attempting to establish WebSocket connections (Notifications, Chat, and Games) immediately after signup/login.

- **Symptom:** `POST /api/ws/ticket` returned a valid ticket, but the subsequent `GET /api/ws?ticket=...` failed with a `401`.
- **Root Cause:** The `AuthRequired` middleware was using Redis `GETDEL` (atomic read-and-delete) for WebSocket tickets. Because the WebSocket handshake in Fiber/Go can trigger the middleware path multiple times during protocol upgrade, the ticket was being consumed on the first pass. Subsequent passes found the ticket missing, resulting in an "Invalid or expired ticket" error.

## 2. Changes Implemented

### A. Middleware Logic Update (`backend/internal/server/server.go`)

- **Deferred Consumption:** Changed the ticket retrieval logic in `AuthRequired`. For paths starting with `/api/ws`, the middleware now uses `GET` instead of `GETDEL`.
- **Context Propagation:** The ticket string is now stored in `c.Locals("wsTicket")` so that the final handler can identify and delete it once the connection is fully established.
- **Backward Compatibility:** Maintained atomic `GETDEL` for any non-WebSocket paths that might use tickets, preserving the "single-use" security property where safe.

### B. Server Helper Method (`backend/internal/server/server.go`)

- Added `consumeWSTicket(ctx, ticketVal)`: A best-effort helper that deletes the ticket from Redis. It is designed to be "silent" on failure to ensure that a connection isn't dropped just because a cleanup command failed.

### C. Handler Integration

Updated the following handlers to call `consumeWSTicket` immediately after validating the user context:

- `WebsocketHandler` in `backend/internal/server/example_handlers.go` (Notifications)
- `WebSocketChatHandler` in `backend/internal/server/websocket_handlers.go` (Chat)
- `WebSocketGameHandler` in `backend/internal/server/game_handlers.go` (Games)

## 3. Verification Results

### Unit Tests Created: `backend/internal/server/ws_ticket_test.go`

- **Test Case 1 (WS Path):** Verified that a ticket remains in Redis after passing through the middleware for a `/api/ws/*` path.
- **Test Case 2 (Non-WS Path):** Verified that tickets are still consumed atomically for other paths.
- **Test Case 3 (Consumption):** Verified that the handlers successfully delete the ticket after establishment.

### Regression Testing

- Ran existing `TestServer_AuthRequired` suite; all 8 sub-tests passed, confirming no impact on standard JWT-based authentication.

## 4. Impact

- **Stability:** WebSocket connections will now reliably upgrade without being killed by the middleware's premature ticket consumption.
- **Security:** The "single-use" nature of the ticket is preserved, but the consumption is moved from the *start* of the handshake to the *successful conclusion* of the handshake.
