# WebSocket/Real-time Features Troubleshooting Session

**Date:** February 15, 2026
**Issue:** WebSocket connections failing, real-time features broken

---

## Problem Summary

After recent commits that removed the Nginx gateway layer, WebSocket connections were silently failing. Users experienced:

- ✅ API and authentication working perfectly
- ❌ Real-time notifications not delivered
- ❌ Real-time chat not working
- ❌ Presence indicators (online/offline status) not updating
- ❌ No visible errors in console or logs (silent failure)

---

## Root Cause

**React 18 StrictMode** incompatibility with WebSocket lifecycle management.

### Technical Details

React 18's StrictMode in development intentionally causes components to mount → unmount → remount to detect side effects. The `useManagedWebSocket` hook had a critical bug:

**The Bug:**

```typescript
// In useManagedWebSocket.ts
const unmountedRef = useRef(false)

useEffect(() => {
  return () => {
    unmountedRef.current = true  // Set on unmount
    // ❌ BUG: Never reset to false on remount!
  }
}, [])
```

**What Happened:**

1. **First mount:** Component mounts, `unmountedRef.current = false`
2. **Async operation starts:** `createTicketedWS()` begins fetching ticket...
3. **StrictMode unmount:** Cleanup runs, sets `unmountedRef.current = true`
4. **Async completes:** WebSocket creation finishes
5. **Check fails:** Code checks `unmountedRef.current` → still `true` → closes WebSocket immediately
6. **Remount:** Component remounts, but `unmountedRef.current` still `true` → all future WebSocket attempts fail

**The Fix:**

```typescript
useEffect(() => {
  unmountedRef.current = false  // ✅ Reset on mount
  return () => {
    unmountedRef.current = true
    // ... cleanup
  }
}, [])
```

---

## Files Modified

### 1. `/frontend/src/hooks/useManagedWebSocket.ts` (Critical Fix)

**Line 291-293:** Added reset of `unmountedRef` on mount

```typescript
useEffect(() => {
  unmountedRef.current = false // Reset on mount (fixes React StrictMode remount)
  return () => {
    unmountedRef.current = true
    enabledRef.current = false
    clearReconnectTimer()
    const ws = wsRef.current
    wsRef.current = null
    // ...
  }
}, [])
```

**Why this matters:** Without resetting `unmountedRef`, the second mount (after StrictMode remount) would always see it as `true`, causing WebSocket creation to immediately close the connection.

---

### 2. `/frontend/src/stores/useAuthSessionStore.ts` (Auth Persistence)

**Problem:** Auth token was in-memory only, causing logout on page refresh

**Before:**

```typescript
export const useAuthSessionStore = create<AuthSessionState>()(
  set => ({
    accessToken: null,
    setAccessToken: (token: string | null) => set({ accessToken: token }),
    clear: () => set({ accessToken: null }),
  })
)
```

**After:**

```typescript
import { persist } from 'zustand/middleware'

export const useAuthSessionStore = create<AuthSessionState>()(
  persist(
    set => ({
      accessToken: null,
      setAccessToken: (token: string | null) => set({ accessToken: token }),
      clear: () => set({ accessToken: null }),
    }),
    {
      name: 'auth-session-storage',  // localStorage key
    }
  )
)
```

**Why this matters:** Zustand's `persist` middleware automatically saves/loads state to/from localStorage, preventing logout on page refresh.

---

### 3. `/frontend/src/hooks/useRealtimeNotifications.ts` (Logging & TypeScript Fix)

**Added logging for debugging:**

```typescript
const wsEnabled = enabled && !!accessToken

logger.debug('[realtime] WebSocket state', {
  wsEnabled,
  enabled,
  hasAccessToken: !!accessToken
})
```

**Fixed TypeScript error:**

```typescript
// Before (6 arguments - error!)
logger.debug('[realtime] wsEnabled:', wsEnabled, 'enabled:', enabled, ...)

// After (2 arguments - correct!)
logger.debug('[realtime] WebSocket state', {
  wsEnabled,
  enabled,
  hasAccessToken: !!accessToken
})
```

---

### 4. `/frontend/src/lib/chat-utils.ts` (WebSocket URL Logging)

**Added logging to diagnose WebSocket URL construction:**

```typescript
export function getWsBaseUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL
  console.log('[ws] VITE_API_URL:', apiUrl)

  if (apiUrl?.startsWith('http')) {
    const url = new URL(apiUrl)
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBaseUrl = `${protocol}//${url.host}`
    console.log('[ws] Using explicit API host for WebSocket:', wsBaseUrl)
    return wsBaseUrl
  }

  // ... same-origin proxy mode
}
```

---

### 5. `/frontend/src/providers/ChatProvider.tsx` (Chat WebSocket Logging)

**Added comprehensive logging for chat WebSocket lifecycle:**

```typescript
createSocket: async () => {
  const userStr = localStorage.getItem('user')
  if (userStr) {
    try {
      const user = JSON.parse(userStr)
      currentUserRef.current = { id: user.id, username: user.username }
      logger.debug('[ChatProvider] Creating chat WebSocket for user', {
        userId: user.id,
        username: user.username
      })
    } catch {}
  } else {
    logger.warn('[ChatProvider] No user in localStorage when creating chat WebSocket')
  }
  await refreshBlockedUsers()
  logger.debug('[ChatProvider] Calling createTicketedWS for /api/ws/chat')
  return createTicketedWS({ path: '/api/ws/chat' })
},
onOpen: ws => {
  logger.debug('[ChatProvider] Chat WebSocket opened', {
    userId: currentUserRef.current?.id,
    username: currentUserRef.current?.username
  })
  // ... rest of onOpen
},
```

---

### 6. `/compose.override.yml` (Direct Backend Connection)

**Changed from Vite proxy to direct backend connection:**

```yaml
frontend:
  environment:
    - VITE_API_URL=http://localhost:8375/api  # Direct backend, bypasses Vite proxy
```

**Why:** Vite's proxy was breaking WebSocket upgrades. The proxy accepted the upgrade (backend logged 101) but failed to maintain the connection. Direct connection bypasses this issue entirely.

**Note:** This is acceptable for dev-only setup. Production should use proper reverse proxy (Nginx/Caddy).

---

## Additional Improvements (UI/UX)

### 7. Removed Redundant Toast Notifications

**Files Modified:**

- `/frontend/src/pages/Chat.tsx` (removed 2 toast notifications)
- `/frontend/src/components/chat/ChatDock.tsx` (removed 1 toast notification)

**Reasoning:** User already has glowing tab list indicators for new messages. Toast notifications were redundant and cluttered the UI.

**Removed:**

```typescript
// Chat.tsx - Line 701
toast.info(`New message in ${roomName}`)

// Chat.tsx - Line 871
toast.info(`New message from ${message.sender?.username ?? 'User'}`)

// ChatDock.tsx - Lines 390-399
toast.message(`${senderName} in ${conversationName}`, {
  description: preview || 'New message',
  action: { ... }
})
```

---

### 8. Made Notification Bell Messages Clickable

**Files Modified:**

- `/frontend/src/hooks/useRealtimeNotifications.ts`
- `/frontend/src/components/TopBar.tsx`

**Added conversation metadata to message notifications:**

```typescript
// useRealtimeNotifications.ts
const conversationId = asNumber(payload.conversation_id)
const fromUserId = asNumber(
  (payload.from_user as Record<string, unknown>)?.id
)

addNotification({
  title: `${username} sent a message`,
  description: desc,
  createdAt: new Date().toISOString(),
  meta: {
    type: 'message',
    conversationId,
    userId: fromUserId,
  },
})
```

**Updated AppNotification interface:**

```typescript
export interface AppNotification {
  id: string
  title: string
  description: string
  createdAt: string
  read: boolean
  meta?: {
    type?: string
    requestId?: number
    userId?: number
    conversationId?: number  // ✅ Added
  }
}
```

**Added click handler in TopBar:**

```typescript
import { useNavigate } from 'react-router-dom'

const navigate = useNavigate()

const handleNotificationClick = (item: typeof notifications[0]) => {
  if (item.meta?.type === 'message' && item.meta.conversationId) {
    navigate(`/chat/${item.meta.conversationId}`)
    removeNotification(item.id)
  }
}

// In notification rendering:
<DropdownMenuItem
  key={item.id}
  className={cn(
    'flex flex-col items-start gap-2 py-2',
    item.meta?.type === 'message' && 'cursor-pointer'
  )}
  onClick={() => handleNotificationClick(item)}
>
```

**Added event propagation prevention for buttons:**

```typescript
// Friend request buttons now stop propagation
onClick={(e) => {
  e.stopPropagation()  // Prevent navigation when clicking Accept/Decline
  // ... button action
}}
```

---

## Verification Steps

After applying the fixes, verify the following:

### 1. WebSocket Connections

```bash
# Check browser console for these logs:
[ws-managed] State: connecting
[ws-managed] Calling createSocket...
[ws-managed] WebSocket created, readyState= 0
[ws-managed] State: connected  # ✅ Should see this, not "disconnected"

[ChatProvider] Creating chat WebSocket for user
[ChatProvider] Chat WebSocket opened
[ChatProvider] Connection state changed
```

### 2. Backend Logs

```bash
# Check Docker logs for successful connections:
docker compose logs app --tail=50 | grep WebSocket

# Should see:
# WebSocket: User X (username) connected to chat
# ChatHub: Registered user X (Active clients: 1)
# NOT immediately followed by "Unregistered"
```

### 3. Real-time Features

- **Friend requests:** Send request → recipient sees notification instantly
- **Chat messages:** Send message → appears in real-time for both users
- **Presence:** User goes online → friend sees status update
- **Typing indicators:** Start typing → other user sees "typing..." indicator

### 4. Browser Network Tab

```
# Filter by "WS" to see WebSocket connections:
- ws://localhost:8375/api/ws (notifications)
- ws://localhost:8375/api/ws/chat (chat)
# Both should show status 101 (Switching Protocols)
# Both should remain connected (not immediately close)
```

---

## Key Learnings

### React 18 StrictMode Best Practices

**Problem:** StrictMode intentionally unmounts/remounts components to detect side effects.

**Solution:** Always reset ref flags on mount:

```typescript
useEffect(() => {
  myRef.current = false  // Reset on mount
  return () => {
    myRef.current = true  // Set on unmount
  }
}, [])
```

**Anti-pattern:**

```typescript
const myRef = useRef(false)

useEffect(() => {
  return () => {
    myRef.current = true  // ❌ Never reset!
  }
}, [])
```

### WebSocket Connection Lifecycle

**Correct lifecycle:**

1. Component mounts
2. `enabled` becomes `true`
3. useEffect triggers `connect()`
4. Async: Fetch ticket from `/api/ws/ticket`
5. Async: Create WebSocket with ticket
6. **Check:** If component still mounted and enabled → attach handlers
7. **If check fails:** Close WebSocket immediately (prevent dangling connections)

**Key insight:** The check at step 6 must account for React StrictMode remounting. Refs must be reset on mount, not just set on unmount.

### Zustand State Persistence

**When to use `persist` middleware:**

- Authentication tokens (survive page refresh)
- User preferences (theme, settings)
- Any state that should survive navigation/refresh

**When NOT to use:**

- Temporary UI state (modal open/closed)
- Data fetched from API (use React Query)
- WebSocket connection state (should reconnect fresh)

---

## Future Improvements

### 1. Production WebSocket Setup

When deploying to production, restore proper reverse proxy:

- Use Nginx or Caddy for WebSocket routing
- Set proper WebSocket timeout (86400s for long-lived connections)
- Add upgrade headers: `Connection: upgrade`, `Upgrade: websocket`
- Consider using WSS (secure WebSocket) with SSL/TLS

### 2. WebSocket Reconnection Strategy

Current: Exponential backoff with delays `[2000, 5000, 10000]ms`

Consider:

- Max reconnection attempts limit
- Online/offline detection (navigator.onLine)
- Visible reconnection status indicator
- Automatic retry on network recovery

### 3. Error Monitoring

Add structured logging for:

- WebSocket connection failures
- Ticket issuance failures
- Auth token expiration
- Network errors

### 4. Performance Optimization

- Debounce typing indicators (currently every keystroke)
- Batch message reads (currently one per message)
- Optimize presence updates (avoid redundant broadcasts)

---

## Troubleshooting Guide

### Issue: WebSocket immediately disconnects

**Symptoms:**

```
[ws-managed] State: connected
[ws-managed] State: disconnected, code=1000, wasClean=true
```

**Diagnosis:**

1. Check if component is unmounting immediately
2. Verify `unmountedRef.current` is `false` when WebSocket created
3. Ensure `enabled` prop stays `true` during connection

**Solution:** Reset refs on mount (see fix #1 above)

---

### Issue: Auth token lost on refresh

**Symptoms:**

- User logged in, but refresh causes logout
- `accessToken` is `null` after page reload

**Diagnosis:**

```typescript
console.log('Auth token:', useAuthSessionStore.getState().accessToken)
// After refresh: null (should be string)
```

**Solution:** Add Zustand `persist` middleware (see fix #2 above)

---

### Issue: One-way messaging (only one user can send)

**Symptoms:**

- User A sends messages → User B receives ✅
- User B sends messages → User A doesn't receive ❌

**Diagnosis:**

```bash
# Check backend logs for both users:
docker compose logs app | grep "ChatHub: Registered"

# Should see:
ChatHub: Registered user 2 (Active clients: 1)
ChatHub: Registered user 6 (Active clients: 2)

# If only one user registered → that user's chat WebSocket didn't connect
```

**Solution:**

1. Hard refresh both browsers (Ctrl+Shift+R)
2. Check console logs for `[ChatProvider] Chat WebSocket opened` in both
3. Verify both users see two WebSocket connections in Network tab

---

## Related Commits

- Initial issue: Gateway/Nginx removal commits
- Fix commit: "Fix WebSocket lifecycle for React 18 StrictMode"
- Auth fix commit: "Add Zustand persist for auth token"
- UX improvements: "Remove redundant toast notifications, add clickable message notifications"

---

## References

- [React 18 StrictMode Documentation](https://react.dev/reference/react/StrictMode)
- [Zustand Persist Middleware](https://docs.pmnd.rs/zustand/integrations/persisting-store-data)
- [WebSocket Protocol Specification](https://datatracker.ietf.org/doc/html/rfc6455)
- [Vite WebSocket Proxy Configuration](https://vitejs.dev/config/server-options.html#server-proxy)
