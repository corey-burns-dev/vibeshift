# Stability-First Realtime Hardening Plan (Chat, Messages, Notifications, Games, Posts, Comments)

## Summary
This plan targets connection reliability first across both prod and local, with immediate WebSocket ticket migration.  
Main issues found are transport/proxy mismatches, fragile WS auth/URL construction, and realtime handler bugs that can cause disconnect loops or dropped events.

## Findings Driving This Plan (ordered by severity)
1. Critical: Production frontend cannot reliably reach API/WS through current container routing.
`frontend/nginx.conf:1` only proxies `/health`, not `/api` or WS upgrade headers.
`compose.yml:53` does not expose backend port publicly, so browser direct calls to `:8375` fail in prod-style deployment.

2. Critical: WS base URL construction is environment-fragile.
`frontend/src/lib/chat-utils.ts:85` hardcodes `hostname + VITE_API_PORT|8375`, ignoring `VITE_API_URL` host/path.
`frontend/src/api/client.ts:50` defaults API to `http://localhost:8375/api`, which breaks deployed browser clients unless overridden at build.

3. High: Game WS has duplicate fanout paths and unsafe multi-writer patterns.
`backend/internal/server/game_handlers.go:176` per-connection Redis subscription writes directly to socket.
`backend/internal/notifications/game_hub.go:102` and `:335` also write to same sockets.
This creates duplicate events and concurrent writes risk.

5. High: Notification WS reconnect is aggressive/fixed-delay and can thrash on auth/network errors.
`frontend/src/hooks/useRealtimeNotifications.ts:455` retries every `1500ms` with no backoff cap.
`frontend/src/hooks/useRealtimeNotifications.ts:460` force-closes on `onerror`, feeding reconnect loop.

6. Medium: Connection limits are likely too low for multi-tab usage with multiple socket types.
`backend/internal/notifications/hub.go:17` `maxConnsPerUser = 5`.
`backend/internal/notifications/chat_hub.go:61` uses same cap for chat sockets.

7. Medium: Backend test workflow is inconsistent locally.
`backend/test/api_integration_test.go:25` forces `DB_HOST=postgres_test`; host `go test` cannot resolve this.
`Dockerfile.test:1` image has Go installed but runtime PATH in service does not include `/usr/local/go/bin` (observed during run), breaking `go test` calls in that container.

## Implementation Plan

### Phase 1: Transport + URL Normalization (prod/local parity)
1. Change frontend API default from hardcoded localhost to same-origin:
`frontend/src/api/client.ts` default `API_BASE_URL` to `'/api'`.
2. Replace `getWsBaseUrl()` logic to derive WS host from resolved API URL (or same-origin), not `VITE_API_PORT`.
3. Keep support for explicit `VITE_API_URL` absolute URLs.
4. Update `frontend/nginx.conf` to proxy `/api` to `app:8375` with WS upgrade headers.
5. Keep `/health` proxy as-is and ensure `/api/ws/*` flows through same proxy.

### Phase 2: WS Ticket Migration (strict for `/api/ws/*`)
1. Frontend: add `apiClient.issueWSTicket()` for `POST /api/ws/ticket`.
2. Frontend: introduce shared helper to open WS with fresh ticket per connection attempt.
3. Migrate all active WS clients to ticket auth:
`frontend/src/providers/ChatProvider.tsx`
`frontend/src/hooks/useRealtimeNotifications.ts`
`frontend/src/hooks/useGameRoomSession.ts`
`frontend/src/hooks/useVideoChat.ts`
`frontend/src/hooks/useChatWebSocket.ts` (deprecated path kept functional).
4. Backend: in `AuthRequired`, for `/api/ws/*`, require valid `ticket` and reject token query auth.
5. Keep existing Bearer auth behavior unchanged for non-WS HTTP routes.

### Phase 3: Game Socket Hardening
1. Remove per-connection Redis subscribe/write loop from `WebSocketGameHandler` and rely on hub wiring fanout.
2. Ensure serialized writes per game connection (mutex or channel-backed writer path) to avoid concurrent write failures.
3. Frontend `useGameRoomSession`: add bounded exponential reconnect (start `1s`, cap `30s`, max `8` attempts), and recover join intent after reconnect.
4. Keep leave semantics intact (`beforeunload` + API leave).

### Phase 4: Reconnect + Capacity Hardening
1. `useRealtimeNotifications`: switch to exponential backoff with jitter (`1s` base, `30s` cap), reset attempts on successful open.
2. On auth failure while obtaining WS ticket, clear auth and redirect login once (no reconnect loop).
3. Increase per-user WS limit from `5` to `12` for chat/notification hubs, with explicit log event when limit is hit.

### Phase 5: Local Test Workflow Reliability
1. Remove hardcoded `DB_HOST=postgres_test` override in integration test setup; use config/env inputs.
2. In `Dockerfile.test`, set PATH to include `/usr/local/go/bin` explicitly.
3. Adjust backend test target guidance so host-run and container-run are both deterministic.

## Public API / Interface Changes
1. Frontend API client adds:
`issueWSTicket(): Promise<{ ticket: string; expires_in: number }>`
2. Auth behavior changes:
`/api/ws/*` will require `ticket` query auth; token-in-query for WS is removed.
3. Frontend env behavior:
`VITE_API_PORT` is deprecated in runtime WS URL resolution.
`VITE_API_URL` remains supported and preferred for explicit override.
4. No HTTP route contract changes for posts/comments/messages/games CRUD endpoints.

## Test Cases and Scenarios

### Automated
1. Frontend unit:
ChatProvider reconnect with fresh ticket and room rejoin.
Realtime notifications reconnect backoff behavior.
WS URL resolver from relative and absolute API URLs.
2. Backend unit:
AuthRequired WS path rejects missing/invalid ticket.
Game hub fanout emits single message per event.
3. Backend integration:
Chat + notifications connection and message flow with ticket auth.
Game room join/move/chat over WS.
Posts/comments realtime invalidation events still received.

### Manual Smoke
1. Prod-style compose smoke:
Frontend container only exposed on `:80`; API + WS work via nginx `/api` proxy.
2. Multi-tab chat:
Open 4 tabs, verify no connection-limit rejection and stable reconnect.
3. Games:
Connect Four room join, move stream, reconnect mid-game.
4. Posts/comments:
Create/update/delete comment and like/unlike post; realtime counters update for other client.

## Assumptions and Defaults
1. Redis remains required for WS ticket issuance and realtime pub/sub.
2. Same-origin `/api` proxy is the default deployment model.
3. Strict WS ticket migration is acceptable now (no hybrid token query fallback).
4. Scope prioritizes reliability fixes first; no architecture rewrite beyond the listed changes.
5. Success criteria:
No repeated connection-error loops in normal auth state.
No WS auth tokens in URL query strings.
Chat/messages/notifications/games/posts/comments realtime behavior remains functionally intact.
