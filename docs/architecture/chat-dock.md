# ChatDock Implementation Guide

This document tracks the implementation of a persistent Facebook Messenger-style chat dock for Sanctum.

---

## Goal

Transform the existing full-page chat views (`/chat` for chatrooms, `/messages` for DMs) into a persistent dock that:

- Floats bottom-right and stays alive across navigation
- Provides a unified inbox of all conversations (friend DMs + room DMs)
- Uses a single persistent WebSocket connection
- Never unmounts while the user is authenticated

---

## ✅ Phase 1: Persistent UI Shell + Zustand Store (COMPLETED)

### What was built

**New files created:**

1. **`frontend/src/stores/useChatDockStore.ts`** -- Zustand store
   - State: `isOpen`, `minimized`, `view`, `activeConversationId`, `drafts`, `unreadCounts`
   - Actions: `toggle`, `open`, `close`, `minimize`, `restore`, `setActiveConversation`, `updateDraft`, `clearDraft`, `incrementUnread`, `resetUnread`
   - Key behavior: `setActiveConversation(id)` switches to conversation view and resets unread count

2. **`frontend/src/components/chat/ChatDockConversationList.tsx`** -- Conversation list panel
   - Unified list of DMs + chatrooms sorted by `last_message.created_at` desc
   - Shows avatar, name, last message preview, unread badge, online status dots
   - Reuses existing utilities: `deduplicateDMConversations`, `getDirectMessageName`, `getDirectMessageAvatar`

3. **`frontend/src/components/chat/ChatDockConversationView.tsx`** -- Active conversation view
   - Header with back arrow, conversation name, online status, expand button
   - Messages panel reusing `MessageItem` component
   - Input with per-conversation draft persistence
   - Calls `useMarkAsRead()` on mount
   - "Expand" button navigates to full-page view (`/messages/:id` or `/chat/:id`)

4. **`frontend/src/components/chat/ChatDock.tsx`** -- Root container
   - Floating button: `fixed bottom-6 right-6 z-[60]`, 48×48 circle with unread badge
   - Panel: `w-[380px] h-[500px]` desktop, near-full-width on mobile
   - Conditionally renders list or conversation view based on Zustand store state

**Modified files:**

- **`frontend/src/App.tsx`** -- Mounted `<ChatDock />` after `<BottomBar />` in `MainLayout`

### Z-Index Strategy

| Element | z-index |
|---------|---------|
| TopBar, MobileHeader, BottomBar | `z-50` |
| ChatDock (button + panel) | `z-[60]` |
| Toasts (Sonner) | `z-[100]` |

### Reused Existing Code

- `useConversations()`, `useMessages()`, `useSendMessage()`, `useMarkAsRead()`, `useConversation()` from `frontend/src/hooks/useChat.ts`
- `usePresenceStore` from `frontend/src/hooks/usePresence.ts`
- `MessageItem` from `frontend/src/components/chat/MessageItem.tsx`
- `getDirectMessageName`, `getDirectMessageAvatar`, `deduplicateDMConversations`, `formatTimestamp` from `frontend/src/lib/chat-utils.ts`
- UI components: `Avatar`, `Button`, `Input`, `ScrollArea` from shadcn/ui

---

## ✅ Phase 2: Persistent WebSocket Connection (COMPLETED)

### What was built

**New files created:**

1. **`frontend/src/providers/ChatProvider.tsx`** -- Root-level WebSocket provider
   - Single persistent WebSocket connection for the entire app
   - Connects once on authentication, stays alive across all navigation
   - Exponential backoff reconnection: starts at 2s, doubles each attempt, max 30s
   - Handles auth changes (closes connection on logout)
   - Guards against React 19 StrictMode double-connect with deferred connection
   - Automatically updates TanStack Query cache for all conversations
   - Provides context API:
     - `joinRoom(conversationId)` / `leaveRoom(conversationId)`
     - `sendTyping(conversationId, isTyping)`
     - `sendMessage(conversationId, content)`
     - `markAsRead(conversationId)`
     - Callback registration: `setOnMessage`, `setOnTyping`, `setOnPresence`, etc.

**Modified files:**

- **`frontend/src/App.tsx`** -- Wrapped app with `<ChatProvider>` at Router level
- **`frontend/src/components/chat/ChatDock.tsx`** -- Refactored to use `useChatContext()` instead of `useChatWebSocket()`
  - Automatically joins all conversation rooms
  - Registers message callback to increment unread counts

### Key improvements

- **Single WebSocket** -- No duplicate connections when navigating
- **Persistent across navigation** -- Connection never dies on route changes
- **Automatic reconnection** -- Exponential backoff with max 30s delay
- **Centralized message handling** -- All messages update TanStack Query cache automatically
- **Clean lifecycle** -- Connection closes properly on logout
- **StrictMode safe** -- Deferred connection prevents React dev mode double-connect

### Trade-offs

- Existing `/chat` and `/messages` pages still call `useChatWebSocket()` directly (creates their own connections)
- This will be optimized in a future phase, but is safe due to shared TanStack Query cache and message deduplication

---

## ✅ Phase 3: Enhanced Notifications & Unread Counts (COMPLETED)

### What was built

#### 3.1 Toast Notifications for Incoming Messages

- **`frontend/src/components/chat/ChatDock.tsx`**
  - In the `setOnMessage` callback: when the message is from another user and the dock is closed, minimized, or a different conversation is active, show a sonner toast.
  - Toast title: `{senderName} in {conversationName}` (sender from `message.sender?.username` or "Someone", conversation name from list or "Message").
  - Description: message preview truncated to 50 chars.
  - Action button "Open": calls `open()` then `setActiveConversation(conversationId)` so the dock opens and switches to that conversation.

#### 3.2 Unread Count Management

- **`frontend/src/stores/useChatDockStore.ts`**
  - Added Zustand `persist` middleware with `partialize: state => ({ unreadCounts: state.unreadCounts })` so unread counts survive refresh (storage key: `chat-dock-storage`).
  - Added `resetUnreadBulk(conversationIds: number[])` for bulk-reset (e.g. when syncing with backend or clearing multiple after full-page read).

- **`frontend/src/components/chat/ChatDockConversationList.tsx`**
  - Conversation names with unread > 0 use `font-semibold`; others stay `font-medium`.
  - Rows with unread > 0 have subtle background `bg-primary/5`.

#### 3.3 Full-Page View Sync

- **`frontend/src/pages/Messages.tsx`** and **`frontend/src/pages/Chat.tsx`**
  - When the user is viewing a conversation on the full-page (selected conversation ID in URL), an effect calls `useChatDockStore.getState().resetUnread(selectedConversationId)` so the dock’s unread count for that conversation stays in sync.

### Not implemented (optional / future)

- Browser `Notification` API when tab is not focused (optional).
- Syncing `unreadCounts` from backend `unread_count` per conversation (when/if backend provides it).

---

## ✅ Phase 4: Polished UX & Persistence (COMPLETED)

### What was built

#### 4.1 Persist Dock State to localStorage

- **`frontend/src/stores/useChatDockStore.ts`**
  - Extended `partialize` to persist `activeConversationId`, `drafts`, and `unreadCounts` (same storage key `chat-dock-storage`).
  - `isOpen` and `minimized` are not persisted (dock starts closed on load; avoids auto-opening).

#### 4.2 Mobile Full-Screen Sheet

- **`frontend/src/hooks/useMediaQuery.ts`** (new)
  - `useMediaQuery(query)` and `useIsMobile()` (max-width 767px, matches Tailwind `md`).
- **`frontend/src/components/chat/ChatDock.tsx`**
  - On mobile: panel renders inside a **Dialog** (existing `DialogContent`) styled as a bottom sheet: full width, bottom-anchored, 90dvh height, slide-in-from-bottom animation, backdrop. Built-in Dialog close button hidden; header keeps Minus/X.
  - On desktop: unchanged floating panel (bottom-right, 380×500).
  - Shared header + body extracted into `ChatDockPanelContent` for both branches.

#### 4.3 Keyboard Shortcuts

- **`frontend/src/components/chat/ChatDock.tsx`**
  - **`Cmd/Ctrl + K`** — toggles dock (open/close or restore if minimized).
  - **`Escape`** — closes dock when open (and not minimized).
  - Shortcuts are disabled when focus is in an `INPUT`, `TEXTAREA`, or contenteditable so typing is not intercepted.
  - Arrow-key navigation in the conversation list was not added (optional enhancement).

---

## ✅ Phase 5: Refactor Existing Pages to Use ChatProvider (COMPLETED)

### What was built

#### 5.1 Messages Page

- **`frontend/src/pages/Messages.tsx`**
  - Replaced `useChatWebSocket()` with `useChatContext()`
  - Join/leave active conversation via `joinRoom` / `leaveRoom`
  - Register callbacks: `setOnTyping`, `setOnPresence`, `setOnConnectedUsers`; cleanup on unmount
  - Use `ctxSendTyping(selectedConversationId, isTyping)` for typing; `joinedRooms.has(id)` for `isJoined`
  - Removed duplicate cache update (provider already updates messages cache)

#### 5.2 Chat Page

- **`frontend/src/pages/Chat.tsx`**
  - Replaced `useChatWebSocket()` with `useChatContext()`
  - Join rooms: selected conversation (when joined) + `openRoomTabs`; leave on cleanup
  - Register callbacks: `setOnMessage`, `setOnTyping`, `setOnPresence`, `setOnConnectedUsers`, `setOnParticipantsUpdate`, `setOnChatroomPresence`; cleanup on unmount
  - Single `setOnMessage` handler dispatches to DM sound vs room message (unread/sound) logic
  - `wsIsJoined` derived from `joinedRooms.has(selectedChatId)`

#### 5.3 ChatDock callback re-registration

- **`frontend/src/components/chat/ChatDock.tsx`**
  - Added `location.pathname` to the `setOnMessage` effect deps so when the user navigates away from `/messages` or `/chat`, the dock re-registers its message handler (full-page views take over the callback while mounted).

#### 5.4 useChatWebSocket

- **`frontend/src/hooks/useChatWebSocket.ts`**
  - JSDoc `@deprecated` added; prefer `useChatContext()` for a single persistent WebSocket. Hook retained for backward compatibility.

---

## Testing & Verification

### Phase 1 & 2 (Completed)

- ✅ Build: `cd frontend && bun run build`
- ✅ Lint: `cd frontend && bun run lint`
- ✅ Manual testing:
  - Dock appears bottom-right when logged in
  - Conversation list loads and displays correctly
  - Can open conversation and send messages
  - Messages persist across navigation
  - Unread badges update in real-time
  - Dock persists when navigating to /posts, /friends, /games
  - Mobile viewport displays correctly
  - Dock disappears on logout

### Phase 3 (Notifications) — Completed

- ✅ Toast appears when message arrives and dock is closed/minimized or another conversation is active
- ✅ Toast "Open" action opens dock and switches to that conversation
- ✅ Unread counts persist across refresh (localStorage)
- ✅ Bold text and subtle background for unread conversations in the list
- ✅ Viewing a conversation on full-page Messages/Chat resets that conversation’s unread in the dock

### Phase 4 (Persistence) — Completed

- ✅ `activeConversationId`, `drafts`, and `unreadCounts` persist after refresh (localStorage)
- ✅ Mobile: dock opens as full-screen bottom sheet (Dialog, slide-up, 90dvh)
- ✅ Desktop: unchanged floating panel
- ✅ Cmd/Ctrl+K toggles dock; Escape closes when open (ignored when typing in inputs)

### Phase 5 (Page Refactor) — Completed

- No duplicate WebSocket connections when using `/messages` or `/chat`
- `/messages` and `/chat` pages use `useChatContext()` and behave as before
- Real-time updates (typing, presence, room presence) still function
- ChatDock re-registers its message handler when navigating away from full-page chat

---

## Architecture Notes

### Current WebSocket Architecture

**Current (Phase 5):**
- `ChatProvider` (root level) — single source of truth for WebSocket
- `ChatDock` — consumes context; re-registers message callback when leaving `/messages` or `/chat`
- `/messages` and `/chat` pages — consume context (no duplicate connections)
- `useChatWebSocket` — deprecated (JSDoc); prefer `useChatContext()`

### State Management

**Zustand stores:**
- `useChatDockStore` -- dock UI state, unread counts, drafts
- `usePresenceStore` -- online user IDs (existing)

**TanStack Query cache:**
- `['chat', 'conversations']` -- conversation list
- `['chat', 'messages', conversationId]` -- messages per conversation
- Updated automatically by ChatProvider WebSocket handler

### Component Hierarchy

```
App.tsx
└── Router
    └── ChatProvider  <-- owns WebSocket
        └── MainLayout
            ├── TopBar / MobileHeader
            ├── Routes (Posts, Messages, Chat, etc.)
            ├── BottomBar
            └── ChatDock  <-- consumes ChatProvider
                ├── ChatDockConversationList
                └── ChatDockConversationView
```

---

## Future Enhancements (Beyond Phase 5)

### Multi-Window Chat (Advanced)

- Support multiple open conversations in tabs/windows
- Store `openConversationIds[]` in Zustand
- Render multiple `ChatDockConversationView` instances
- Tab bar UI to switch between conversations

### Voice/Video Call Integration

- Add call buttons in conversation header
- Integrate with existing VideoChat feature
- WebRTC signaling via WebSocket

### Message Search

- Add search input in conversation list
- Filter by conversation name or message content
- Use backend search endpoint if available

### Read Receipts

- Show "seen by" status for messages
- Display avatars of users who read the message
- Requires backend support for read receipts

### Message Reactions

- Add emoji reaction picker on message hover
- Store reactions in message metadata
- Real-time sync via WebSocket

---

## Known Issues & Trade-offs

### Current (Phase 5)

- ✅ **Resolved:** Single WebSocket via ChatProvider; no duplicate connections from dock or full-page chat
- ✅ **Resolved:** Unread counts, active conversation, drafts persist across refresh (Phases 3–4)
- ✅ **Resolved:** `/messages` and `/chat` use `useChatContext()` (Phase 5)
- **Note:** `isOpen` and `minimized` are intentionally not persisted so the dock does not auto-open on load.

### Architectural Decisions

**Why Zustand for dock state?**
- Lightweight, no provider boilerplate
- Easy to access outside React components if needed
- Already used for `usePresenceStore`

**Why not use TanStack Query for unread counts?**
- Unread counts are ephemeral UI state, not server data
- Simpler to manage in Zustand with local increments
- Can sync with server data when available

**Why keep existing pages using useChatWebSocket in Phase 2?**
- Minimizes risk and scope of Phase 2
- Pages continue to work while ChatProvider is stabilized
- Easier to test in isolation
- Phase 5 will unify them

---

## References

- [Zustand Documentation](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [TanStack Query Documentation](https://tanstack.com/query/latest/docs/framework/react/overview)
- [React Context API](https://react.dev/reference/react/createContext)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
