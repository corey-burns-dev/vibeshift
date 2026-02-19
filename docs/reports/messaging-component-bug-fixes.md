# Messaging Component Bug Fixes

**Date:** 2026-02-19
**Scope:** Frontend — friend DM / ChatDock system
**Files changed:**
- `frontend/src/components/chat/ChatDock.tsx`
- `frontend/src/providers/ChatProvider.tsx`
- `frontend/src/hooks/useRealtimeNotifications.ts`

---

## Background

Analysis of the floating ChatDock (bottom-right message icon), friend DM notifications, and mobile interaction patterns revealed four distinct bugs. This report documents each root cause, the code path that triggered it, and the fix applied.

---

## Bug 1 — "Loading…" when clicking an online-user toast

### Symptom
Clicking a friend-online toast (or a friend in the presence section) opened the conversation panel, but the header showed "Loading…" indefinitely. The only workaround was to navigate back to the friend list and then re-enter the conversation.

### Root cause
Both friend-online toast `onClick` handlers in `ChatDock.tsx` called `setActiveConversation(-userId)` directly — passing the **negative virtual ID** used for friends who have no prior conversation.

```ts
// BEFORE (broken)
onClick={() => {
  setActiveConversation(-userId)  // negative virtual ID
  open()
}}
```

`useConversation` is intentionally disabled for negative IDs (`enabled: activeConversationId > 0`), so `activeConversation` stayed `undefined`. `ChatDockConversationView` derives its header name as `conversation ? ... : 'Loading...'`, leaving the view permanently stuck.

The same negative ID was also pushed into `openConversationIds`. `conversations.find(c => c.id === -userId)` would never match a real conversation, so the tab rendered nothing and room join/leave logic was confused.

The correct path for virtual DMs is `handleSelectConversation`, which calls `createConversation({ participant_ids: [friendId] })` and only sets `activeConversationId` to the real positive ID returned by the server.

### Fix
A stable `useRef` (`handleSelectConversationRef`) is defined near the top of `ChatDock` and kept up-to-date on every render:

```ts
const handleSelectConversationRef = useRef<(id: number | null) => void>(() => {})
// ...after handleSelectConversation is defined:
handleSelectConversationRef.current = handleSelectConversation
```

Both toast `onClick` handlers now call the ref instead of bypassing the creation flow:

```ts
// AFTER (fixed)
onClick={() => {
  handleSelectConversationRef.current(-userId)  // creates real conversation first
  open()
}}
```

Using a ref avoids adding `handleSelectConversation` to the presence subscription effect's dependency array (which would cause unnecessary re-subscriptions).

---

## Bug 2 — Double presence notifications on friend online/offline

### Symptom
When a friend came online, two separate toast notifications appeared. On smaller viewports this was especially noticeable as both the floating icon pulse *and* a separate notification window fired simultaneously.

### Root cause
Two independent WebSocket channels both handled friend presence changes and both showed toasts:

| Source | WebSocket | Handler | Action |
|--------|-----------|---------|--------|
| `useRealtimeNotifications.ts` | `/api/ws` | `friend_presence_changed` | `toast.message(...)` |
| `ChatDock.tsx` | `/api/ws/chat` | `subscribeOnPresence` | `toast(...)` |

The backend sends presence events to **both** channels independently, so both handlers fired for the same real-world event. The `useRealtimeNotifications` toast also offered a "Message" action that navigated to `/chat/${conv.id}` via a full page redirect — conflicting with the dock's own navigation logic.

### Fix
Removed the `toast.message` calls from `useRealtimeNotifications.ts` for `friend_presence_changed` (both online and offline). The `setOnline` / `setOffline` presence-store updates are preserved since other components depend on them. The `openDirectMessage` helper function (only used by those toasts) was also removed, along with its `apiClient` import.

`ChatDock.tsx` remains the sole owner of user-facing presence notifications, keeping the UX consistent and dock-integrated.

---

## Bug 3 — Unread badge (floating icon) not updating for new DMs

### Symptom
When a friend sent a message to a conversation that had no prior history (first-ever DM), the unread badge on the bottom-right icon did not appear, or appeared with a significant delay.

### Root cause — virtual vs real ID mismatch

`friendDMConversations` is built from the `conversations` query. For friends with no prior DM, a **virtual entry** with `id = -friendId` is synthesised client-side. When the first message arrives from the server, the WebSocket payload contains the **real positive conversation ID** (e.g. `42`).

The old `totalUnread` computed the badge count by iterating `friendDMConversations`:

```ts
// BEFORE (broken for new DMs)
const totalUnread = useMemo(() => {
  let count = 0
  for (const conv of friendDMConversations) {
    count += unreadByConversation[String(conv.id)] || 0  // looks up "-friendId", not "42"
  }
  return count
}, [friendDMConversations, unreadByConversation])
```

`incrementUnread(42)` stored the count under `"42"`, but the loop looked up `"-friendId"` → `0`. The badge stayed at 0 until the conversations query was re-fetched (~300 ms) and the virtual entry was replaced by the real one.

### Fix
Since `incrementUnread` is only ever called for verified friend DMs, every entry in `unreadByConversation` is a legitimate unread count. The computation now sums **all entries** directly:

```ts
// AFTER (fixed)
const totalUnread = useMemo(
  () => Object.values(unreadByConversation).reduce((sum, n) => sum + n, 0),
  [unreadByConversation]
)
```

This removes the dependency on `friendDMConversations` and eliminates the timing window entirely.

---

## Bug 4 — Unread badge resets to zero after page reload

### Symptom
After refreshing the page, the floating icon badge always showed zero even if there were unread messages from before the reload.

### Root cause — two unread-tracking systems out of sync

The floating icon badge reads from `unreadByConversation` in `ChatProvider` context, which is **in-memory only** and starts as `{}` on every page load.

The `useChatDockStore` Zustand store has a separate `unreadCounts` field that **is persisted to localStorage**, but the badge never read from it. Furthermore, when a new message incremented the context count (`incrementUnread` from ChatProvider), the store's `unreadCounts` was never updated — so even the persisted copy quickly became stale.

### Fix — two-part

**Part A — Mirror increments into the store.** In the message handler in `ChatDock.tsx`, after the context increment, the store is also incremented via a direct state call (matching an existing pattern in that function):

```ts
newUnreadCount = incrementUnread(conversationId)           // context (for live badge)
useChatDockStore.getState().incrementUnread(conversationId) // store  (for persistence)
```

**Part B — Seed context from store on mount.** A new `seedUnread(counts)` method was added to `ChatProvider`. It bulk-inserts counts that are not already tracked (prevents double-counting on a fresh session where messages arrive before the seed):

```ts
// ChatProvider.tsx
const seedUnread = useCallback((counts: Record<string, number>) => {
  const toSeed = Object.fromEntries(
    Object.entries(counts).filter(([key, val]) => val > 0 && !(key in unreadByConversationRef.current))
  )
  if (Object.keys(toSeed).length === 0) return
  const next = { ...unreadByConversationRef.current, ...toSeed }
  unreadByConversationRef.current = next
  setUnreadByConversation(next)
}, [])
```

`ChatDock.tsx` calls this once on mount:

```ts
useEffect(() => {
  const { unreadCounts } = useChatDockStore.getState()
  const stringKeyed: Record<string, number> = {}
  for (const [id, count] of Object.entries(unreadCounts)) {
    if (count > 0) stringKeyed[String(id)] = count
  }
  if (Object.keys(stringKeyed).length > 0) seedUnread(stringKeyed)
}, [seedUnread])
```

The badge is now correct immediately on page load, and stays in sync across the session.

---

## Summary of changes

| File | Change |
|------|--------|
| `ChatDock.tsx` | Added `handleSelectConversationRef`; changed both presence-toast `onClick` handlers to call the ref instead of `setActiveConversation(-id)` |
| `ChatDock.tsx` | Added `seedUnread` to context destructuring; added mount effect to seed from persisted store |
| `ChatDock.tsx` | Added `useChatDockStore.getState().incrementUnread(conversationId)` alongside context increment in the message handler |
| `ChatDock.tsx` | Simplified `totalUnread` to `Object.values(unreadByConversation).reduce(...)` |
| `ChatProvider.tsx` | Added `seedUnread(counts)` to context interface, implementation, value object, and memo deps |
| `useRealtimeNotifications.ts` | Removed `openDirectMessage` function and `apiClient` import; stripped `toast.message` calls from `friend_presence_changed`; removed `openDirectMessage` from `handleRealtimeMessage` deps |
