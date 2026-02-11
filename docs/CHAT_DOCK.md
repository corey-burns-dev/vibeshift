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

## 🔄 Phase 3: Enhanced Notifications & Unread Counts (PLANNED)

### Goals

Improve user awareness of new messages with toast notifications and better unread count management.

### Implementation Plan

#### 3.1 Toast Notifications for Incoming Messages

**When to show toasts:**
- Dock is closed OR minimized
- Message is from another user (not the current user)
- Message is in a conversation that's not currently active

**Toast content:**
- Sender name + avatar
- Message preview (truncated to ~50 chars)
- Click action: opens dock and switches to that conversation

**Files to modify:**

1. **`frontend/src/components/chat/ChatDock.tsx`**
   - In the `setOnMessage` callback, check dock state (`isOpen`, `minimized`, `activeConversationId`)
   - If message should trigger toast, call `toast()` from `sonner`
   - Toast onClick: `open()`, `setActiveConversation(conversationId)`

2. **Consider permission for browser notifications (optional)**
   - If user grants permission, show browser notifications when tab is not focused
   - Use `Notification` API with same content as toasts

#### 3.2 Improve Unread Count Management

**Current behavior:**
- Unread counts increment via `onRoomMessage` callback
- Counts reset when conversation becomes active

**Enhancements:**
- Persist unread counts to localStorage (survive refresh)
- Add unread count to conversation list items (already has unread badge)
- Consider marking conversations as "unread" vs "read" visually (bold text for unread)

**Files to modify:**

1. **`frontend/src/stores/useChatDockStore.ts`**
   - Add Zustand persist middleware for `unreadCounts`
   - Add action to bulk-reset unread counts when user reads messages via full-page view

2. **`frontend/src/components/chat/ChatDockConversationList.tsx`**
   - Apply bold font weight to conversation names with unread > 0
   - Consider adding a subtle background highlight for unread conversations

#### 3.3 Sync with Backend Unread Counts (if available)

**If backend provides `unread_count` per conversation:**
- Initialize Zustand `unreadCounts` from backend data on load
- Reconcile local increments with server truth periodically

**Files to check:**
- `frontend/src/hooks/useChat.ts` -- see if `useConversations()` returns unread counts
- Backend conversation endpoints -- check response schema

---

## 🔄 Phase 4: Polished UX & Persistence (PLANNED)

### Goals

Add localStorage persistence for dock state and improve mobile experience.

### Implementation Plan

#### 4.1 Persist Dock State to localStorage

**What to persist:**
- `activeConversationId` -- resume where user left off
- `drafts` -- preserve unsent message text across sessions
- `unreadCounts` -- preserve unread counts across refresh (if not synced from backend)
- `isOpen` -- optionally remember if dock was open (may be annoying if it auto-opens)

**Files to modify:**

1. **`frontend/src/stores/useChatDockStore.ts`**
   - Add Zustand `persist` middleware
   - Selective persistence (e.g., don't persist `minimized` state)
   - Example:
     ```ts
     import { persist } from 'zustand/middleware'

     export const useChatDockStore = create<ChatDockState>()(
       persist(
         (set, get) => ({
           // ... state and actions
         }),
         {
           name: 'chat-dock-storage',
           partialize: (state) => ({
             activeConversationId: state.activeConversationId,
             drafts: state.drafts,
             unreadCounts: state.unreadCounts,
           }),
         }
       )
     )
     ```

#### 4.2 Mobile Full-Screen Sheet (Optional Enhancement)

**Current mobile behavior:**
- Dock panel: `max-md:inset-x-2 max-md:bottom-20 max-md:h-[70dvh]`
- Works well but could be more immersive

**Potential enhancement:**
- When dock opens on mobile, render as a full-screen modal/sheet
- Use `Dialog` or `Sheet` component from shadcn/ui
- Slide up from bottom with backdrop
- Close button in top-left, keep header consistent

**Files to modify:**

1. **`frontend/src/components/chat/ChatDock.tsx`**
   - Wrap panel in `<Sheet>` component on mobile breakpoint
   - Use `useMediaQuery` to detect mobile viewport
   - Adjust header layout for sheet context

#### 4.3 Keyboard Shortcuts (Optional)

**Potential shortcuts:**
- `Cmd/Ctrl + K` -- toggle dock (like VS Code command palette)
- `Escape` -- close dock when open
- Arrow keys to navigate conversation list

**Files to modify:**

1. **`frontend/src/components/chat/ChatDock.tsx`**
   - Add global keyboard event listener
   - Use `useEffect` to register/cleanup listener
   - Check if input is focused (avoid capturing when user is typing)

---

## 🔄 Phase 5: Refactor Existing Pages to Use ChatProvider (PLANNED)

### Goals

Eliminate duplicate WebSocket connections by migrating `/chat` and `/messages` pages to use `ChatProvider` context.

### Implementation Plan

#### 5.1 Refactor Messages Page

**Current behavior:**
- Calls `useChatWebSocket()` directly with active conversation ID
- Creates its own WebSocket connection

**Target behavior:**
- Use `useChatContext()` from ChatProvider
- Register callbacks for typing, presence, participants
- Call `joinRoom` / `leaveRoom` based on active conversation

**Files to modify:**

1. **`frontend/src/pages/Messages.tsx`**
   - Replace `useChatWebSocket()` with `useChatContext()`
   - Remove WS connection logic
   - Use context methods: `joinRoom`, `leaveRoom`, `sendTyping`
   - Register callbacks: `setOnTyping`, `setOnPresence`, `setOnParticipantsUpdate`
   - Cleanup callbacks on unmount

#### 5.2 Refactor Chat Page

**Current behavior:**
- Similar to Messages page, creates own WebSocket connection

**Target behavior:**
- Same as Messages page refactor

**Files to modify:**

1. **`frontend/src/pages/Chat.tsx`**
   - Apply same refactor pattern as Messages.tsx
   - Ensure chatroom presence updates work correctly

#### 5.3 Update or Deprecate useChatWebSocket Hook

**Option A: Deprecate**
- Mark `useChatWebSocket` as deprecated with JSDoc comment
- Add warning in implementation to use `useChatContext` instead
- Eventually remove in future cleanup

**Option B: Refactor**
- Make `useChatWebSocket` a thin wrapper around `useChatContext`
- Maintains backward compatibility while using shared connection

**Files to modify:**

1. **`frontend/src/hooks/useChatWebSocket.ts`**
   - Add deprecation notice or refactor to use context
   - Update documentation

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

### Phase 3 (Notifications)

- Toast appears when message arrives and dock is closed/minimized
- Toast click opens dock and switches to conversation
- Unread counts persist across refresh
- Bold text for unread conversations

### Phase 4 (Persistence)

- Dock state persists after browser refresh
- Draft messages preserved across sessions
- Active conversation ID restored on reload

### Phase 5 (Page Refactor)

- No duplicate WebSocket connections
- `/messages` and `/chat` pages work identically to before
- Real-time updates (typing, presence) still function
- No console errors or warnings

---

## Architecture Notes

### Current WebSocket Architecture

**Phase 1 & 2:**
- `ChatProvider` (root level) -- owns single persistent WebSocket
- `ChatDock` -- consumes context, never unmounts
- `/messages` and `/chat` pages -- still use `useChatWebSocket` (creates duplicate connections)

**After Phase 5:**
- `ChatProvider` (root level) -- single source of truth for WebSocket
- `ChatDock` -- consumes context
- `/messages` and `/chat` pages -- consume context (no duplicate connections)
- `useChatWebSocket` -- deprecated or refactored as thin wrapper

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

### Current (Phase 2)

- ✅ **Resolved:** Duplicate WebSocket connections eliminated for ChatDock
- ⚠️ **Remaining:** `/messages` and `/chat` pages still create their own connections (will be resolved in Phase 5)
- ⚠️ **No persistence:** Dock state resets on refresh (will be resolved in Phase 4)

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
