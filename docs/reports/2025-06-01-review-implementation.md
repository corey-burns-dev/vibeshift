> Historical Snapshot: point-in-time report retained for reference.

# Full-Stack Review — Implementation Report

**Commit:** `2ef0c79` — `fix: implement full-stack review fixes`  
**Date:** June 2025

> Note: filename uses `2025-06-01` because only month/year were documented in the source report (inferred day).  
**Scope:** 19 files changed, +611 / -195 lines across backend and frontend

---

## Summary

Implemented fixes for **30+ findings** from the full-stack engineering review. All changes pass pre-commit hooks (Go lint, Go fmt, Biome check, Biome format, TypeScript typecheck).

---

## Backend Changes (8 files)

### Security (CRITICAL + HIGH)

| Finding | Fix | File |
|---------|-----|------|
| Default JWT secret passes validation in production | Reject `your-secret-key-change-in-production` when `APP_ENV=production` | `config.go` |
| `sslmode=disable` hardcoded in DSN | New `DB_SSLMODE` config field; defaults to `disable`, warns in production | `config.go`, `database.go` |
| `validateChatToken` skips issuer/audience | Added `jwt.WithIssuer`, `jwt.WithAudience`, `jwt.WithValidMethods` options | `websocket_handlers.go` |
| DB hit per WS connect for username | Embedded `username` claim in JWT; `validateChatToken` reads from token first | `auth_handlers.go`, `websocket_handlers.go` |
| Redundant password stripping in GetFriends | Removed manual `Password = ""` loop (model has `json:"-"` tag) | `friend_handlers.go` |
| TURN server not configurable | Added `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD` to Config struct | `config.go` |

### Reliability (HIGH)

| Finding | Fix | File |
|---------|-----|------|
| WebSocket write race in VideoChatHub | Added per-connection `writeMu sync.Mutex` on `videoChatPeer` with `safeWrite()` | `videochat_hub.go` |
| Race condition in Join (unlock→broadcast gap) | Collect peers under lock, broadcast outside lock using collected refs | `videochat_hub.go` |
| Unbounded room/peer maps | Added `MaxPeersPerRoom=10`, `MaxTotalRooms=1000` with error responses | `videochat_hub.go` |
| No ping/pong heartbeat on video WS | 30s ping interval, 40s pong timeout, `SetReadDeadline` reset on pong | `websocket_videochat.go` |
| `SetReadLimit(4096)` too small for SDP | Increased to 16KB (`videoChatMaxMessageSize = 16384`) | `websocket_videochat.go` |
| No graceful HTTP shutdown | Store `app` on Server struct; `Shutdown()` calls `app.ShutdownWithContext()` | `server.go` |
| `context.Background()` in all StartWiring goroutines | Server-scoped `shutdownCtx` with `cancel()` in `Shutdown()` | `server.go` |
| Shutdown writes to closed connections (noisy errors) | Best-effort `safeWrite` + `_ = peer.Conn.Close()` (errors suppressed) | `videochat_hub.go` |

### Code Quality (MEDIUM + LOW)

| Finding | Fix | File |
|---------|-----|------|
| Dead code: `GetRoomPeers()` never called | Removed | `videochat_hub.go` |
| Duplicate `// AuthRequired` comment | Removed duplicate | `server.go` |
| `RejectFriendRequest` returns 200 | Changed to `fiber.StatusNoContent` (204) | `friend_handlers.go` |
| `// Add other repositories as needed` comment | Removed | `server.go` |

---

## Frontend Changes (11 files)

### Architecture

| Finding | Fix | File |
|---------|-----|------|
| UserContextMenu + UserMenu ~95% duplicated logic | Extracted `useUserActions(user)` shared hook | `useUserActions.ts` (new) |
| No ErrorBoundary around lazy routes | Wrapped `<RoutesWithPrefetch />` in `<ErrorBoundary>` | `App.tsx` |
| `useFriends` missing from barrel export | Added `export * from './useFriends'` and `export * from './useUserActions'` | `hooks/index.ts` |

### Video Chat Improvements

| Finding | Fix | File |
|---------|-----|------|
| Only STUN servers (blocks ~15% of users) | `buildIceConfig()` reads `VITE_TURN_URL/USERNAME/PASSWORD` env vars | `useVideoChat.ts` |
| No reconnection logic | Exponential backoff reconnect (max 5 attempts, 1s base delay) | `useVideoChat.ts` |
| `reconnectTimeoutRef` declared but unused | Now drives reconnection with proper cleanup on intentional disconnect | `useVideoChat.ts` |
| No camera permission pre-check | `navigator.permissions.query({ name: 'camera' })` before `getUserMedia` | `useVideoChat.ts` |

### Code Quality

| Finding | Fix | File |
|---------|-----|------|
| `console.log` in production code (9 instances) | Removed from TicTacToe, ConnectFour, usePosts; kept error-level in useChatWebSocket | `TicTacToe.tsx`, `ConnectFour.tsx`, `usePosts.ts`, `useChatWebSocket.ts` |
| `confirm()` for destructive actions | Removed from menu components (action guard moved to hook) | `UserContextMenu.tsx`, `UserMenu.tsx` |

---

## Items Deferred (require infrastructure or major refactoring)

| Finding | Reason | Priority |
|---------|--------|----------|
| JWT token in WebSocket URL → ticket-based auth | Requires new REST endpoint + Redis-backed ticket store; significant API change | CRITICAL |
| JWT 7-day expiry + no revocation blocklist | Requires Redis-based JTI blocklist + middleware changes | CRITICAL |
| Server struct God Object (16 fields) | Architectural refactor; split into domain-specific sub-servers | MEDIUM |
| No CSRF protection | Requires middleware + frontend token management | MEDIUM |
| Per-user WS connection limits | Requires connection tracking middleware | MEDIUM |
| Redis subscriber goroutine cleanup | Subscribers need context-aware shutdown plumbing | MEDIUM |
| XSS sanitization on user content | Requires choosing a sanitization library + applying across handlers | HIGH |
| WS message rate limiting | Needs per-connection token bucket implementation | LOW |
| Pagination on GetFriends | API change + frontend update | MEDIUM |

---

## Verification

```
✅ go build ./...          — compiles clean
✅ golangci-lint run ./...  — 0 issues
✅ npx tsc --noEmit         — no errors
✅ npx biome check .        — no errors
✅ Pre-commit hooks          — all passed
```
