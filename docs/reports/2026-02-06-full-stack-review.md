> Historical Snapshot: point-in-time report retained for reference.

# Sanctum Full-Stack Engineering Review

**Date:** 2026-02-06
**Scope:** Backend (Go/Fiber), Frontend (React/TypeScript), Video Chat (WebRTC), Theme, UX

---

## Summary Counts

| Severity | Count |
| -------- | ----- |
| CRITICAL | 2     |
| HIGH     | 11    |
| MEDIUM   | 19    |
| LOW      | 10    |

---

## 1. SECURITY

### [CRITICAL] JWT token passed in WebSocket query string — logged & cached

- `frontend/src/hooks/useVideoChat.ts` L256: Token appended to URL: `...?token=${token}&room=...`
- `backend/internal/server/websocket_videochat.go` L22: `conn.Query("token")`
- `backend/internal/server/websocket_handlers.go` L52: Same pattern for chat WS.
- Tokens in URLs appear in browser history, proxy/CDN logs, and server access logs. **Mitigation**: use a short-lived, single-use WS ticket exchanged via an authenticated POST, not the long-lived JWT.

### [CRITICAL] JWT 7-day expiry with no revocation mechanism

- `backend/internal/server/auth_handlers.go` L164: `"exp": now.Add(time.Hour * 24 * 7).Unix()`
- `backend/internal/server/server.go` L373-L378: JTI check is a no-op comment. No blocklist exists — a stolen token cannot be invalidated for 7 days.

### [HIGH] Weak default JWT secret passes validation

- `backend/internal/config/config.go` L59: `viper.SetDefault("JWT_SECRET", "your-secret-key-change-in-production")`
- `backend/internal/config/config.go` L74-L76: `Validate()` only logs a warning for secrets < 32 chars. The default secret (36 chars) passes validation.

### [HIGH] Database connected with `sslmode=disable`

- `backend/internal/database/database.go` L94: Plaintext credentials + unencrypted connection. Must enforce `sslmode=require` in production.

### [HIGH] User password hash returned in `GetFriends` response

- `backend/internal/server/friend_handlers.go` L163-L166: Manually strips `Password` with `friends[i].Password = ""`. Fragile approach.

### [HIGH] WebSocket `validateChatToken` skips issuer/audience validation

- `backend/internal/server/websocket_handlers.go` L303-L338: Compared to `AuthRequired()` which validates `iss` and `aud` claims, `validateChatToken` skips these checks entirely.

### [MEDIUM] Friend request auto-accepts — no consent model

- `backend/internal/server/friend_handlers.go` L60-L62: `Status: models.FriendshipStatusAccepted` — makes `AcceptFriendRequest`/`RejectFriendRequest` dead code.

### [MEDIUM] No CSRF protection on auth endpoints

- Login/Signup accept JSON POST with `AllowCredentials: true` CORS. No CSRF token or `SameSite` cookie strategy.

### [MEDIUM] Video chat room IDs are guessable/predictable

- `frontend/src/components/UserContextMenu.tsx` L48-L49: `roomId = vc-${ids[0]}-${ids[1]}` — deterministic from public user IDs. No server-side room access control.

### [LOW] Rate limit inconsistency

- `backend/internal/server/server.go` L192: create_post 1/5min vs create_comment 1/min.

---

## 2. PERFORMANCE

### [HIGH] Unbounded in-memory maps in VideoChatHub with no room size limit

- `backend/internal/notifications/videochat_hub.go` L41: `rooms map[string]map[uint]*videoChatPeer` grows without bounds. No max room size, no max total rooms.

### [HIGH] WebSocket write contention — no write serialization

- `backend/internal/notifications/videochat_hub.go` L86: `conn.WriteMessage()` called from `Join()` and `broadcastToRoom` concurrently. WebSocket `Conn.WriteMessage` is NOT safe for concurrent calls.

### [MEDIUM] `validateChatToken` hits the database on every WebSocket connect

- `backend/internal/server/websocket_handlers.go` L331: `s.userRepo.GetByID(context.Background(), ...)` — fetches user from DB for username.

### [MEDIUM] No pagination on `GetFriends`

- `backend/internal/server/friend_handlers.go` L155: Returns all friends with no limit.

### [MEDIUM] `context.Background()` used instead of request context in WebSocket handlers

- `backend/internal/server/websocket_handlers.go` L25, L331: DB queries won't be cancelled on client disconnect.

### [LOW] Redis pub/sub subscribers leak on shutdown

- `backend/internal/notifications/notifier.go` L49-L56: `PSubscribe` subscription never closed.

### [LOW] Hub `StartWiring` goroutines launched with `context.Background()`

- `backend/internal/server/server.go` L437-L466: Can't be cancelled on shutdown.

---

## 3. RELIABILITY

### [HIGH] Race condition in `VideoChatHub.Join`

- `backend/internal/notifications/videochat_hub.go` L55-L80: Lock released then `broadcastToRoom` acquires `RLock`. Between unlock and broadcast, another user could join/leave.

### [HIGH] No WebSocket ping/pong heartbeat in video chat

- `backend/internal/server/websocket_videochat.go` L57-L66: No periodic ping. Stale connections from NAT timeouts won't be detected.

### [MEDIUM] No reconnection logic in `useVideoChat`

- `frontend/src/hooks/useVideoChat.ts` L275-L277: `ws.onclose` just sets `isConnected = false`. `reconnectTimeoutRef` declared but never used.

### [MEDIUM] `Shutdown` writes to connections that may already be closed

- `backend/internal/notifications/videochat_hub.go` L188-L200: Read loop may have already closed the connection.

### [MEDIUM] `Start()` doesn't store the Fiber app, so `Shutdown()` can't call `app.Shutdown()`

- `backend/internal/server/server.go` L424: `app` is local. `Shutdown()` at L472 can't drain in-flight requests.

### [LOW] `GetRoomPeers` is exported but never called

- `backend/internal/notifications/videochat_hub.go` L166: Dead code.

---

## 4. CODE QUALITY

### [HIGH] Massive duplication between `UserContextMenu` and `UserMenu`

- ~95% logic duplication. Extract a shared `useUserActions(user)` hook and shared menu-items renderer.

### [MEDIUM] Duplicate `AuthRequired` comment

- `backend/internal/server/server.go` L292-L293: Comment appears twice consecutively.

### [MEDIUM] Inconsistent error handling patterns

- `friend_handlers.go` returns `fiber.StatusOK` for reject. Should return `204 No Content`.

### [MEDIUM] `any` usage in frontend

- `frontend/src/api/client.ts` L379: `Promise<any>` in `getGameStats`.

### [LOW] Dead friend request flow code

- `AcceptFriendRequest`/`RejectFriendRequest` handlers unreachable with auto-accept.

### [LOW] `console.log` left in production code

- `frontend/src/pages/games/TicTacToe.tsx` L134: `console.log('WebSocket connected')`.

---

## 5. ARCHITECTURE

### [HIGH] No graceful HTTP server shutdown

- `app` is local to `Start()`. `Shutdown()` can't drain in-flight HTTP requests.

### [MEDIUM] `Server` struct is a God Object

- 12 repository fields + 4 hub fields + config + DB + Redis.

### [MEDIUM] Frontend token stored in `localStorage` — XSS exploitable

- `frontend/src/hooks/useAuth.ts` L16: `localStorage.setItem('token', data.token)`.

### [MEDIUM] No dependency injection / interface for hubs

- Concrete types on `Server`. Testing requires real instances.

### [LOW] Config validation doesn't enforce production constraints

- Only validates `Port` and `JWTSecret` length as a warning.

---

## 6. FRONTEND UX

### [MEDIUM] No error boundary wrapping video chat or games

- `frontend/src/App.tsx`: Uses `<Suspense>` but no `<ErrorBoundary>`.

### [MEDIUM] Sidebar hover-expand pattern has mobile accessibility issues

- `onMouseEnter/onMouseLeave` unusable on touch devices.

### [MEDIUM] Video chat has no camera/mic permission pre-check

- Immediately calls `getUserMedia()`. No pre-check.

### [MEDIUM] `confirm()` used for destructive actions

- `frontend/src/components/UserContextMenu.tsx` L98: Native browser confirm.

### [LOW] Video grid layout jumps when participants join/leave

- No transition or animation.

### [LOW] No loading state feedback for friend actions

---

## 7. MISSING FEATURES / GAPS

### [HIGH] No frontend test coverage for video chat

- No test file for `useVideoChat.ts` or `VideoChat.tsx`.

### [HIGH] No TURN server configuration

- `frontend/src/hooks/useVideoChat.ts` L30-L34: Only STUN servers. WebRTC fails for ~15% of users behind symmetric NAT.

### [HIGH] No input sanitization on user-generated content

- Posts, comments, chat, stream titles not sanitized for XSS.

### [MEDIUM] No database connection pooling configuration

- Uses GORM defaults. Needs explicit `MaxOpenConns`, `MaxIdleConns`, `ConnMaxLifetime`.

### [MEDIUM] No WebSocket connection limits per user

- No per-user cap enables resource exhaustion.

### [MEDIUM] No monitoring/metrics for WebSocket connections

- `/metrics` only tracks HTTP, not WS counts or throughput.

### [MEDIUM] TODOs in documentation indicate incomplete features

- `docs/API-ARCHITECTURE.md`: 5 outstanding TODOs.

### [LOW] No rate limiting on WebSocket messages

- Read loop processes messages as fast as they arrive.

### [LOW] `useFriends` hook not exported from hooks barrel

- `frontend/src/hooks/index.ts`: Missing export.

---

## Top 3 Priorities

1. **JWT-in-URL exposure** across all WS endpoints + no token revocation
2. **WebSocket write race conditions** in VideoChatHub (data corruption / crashes)
3. **Missing TURN servers + XSS sanitization** (blocks real-world deployment)
