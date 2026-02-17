# Fixing the Messenger: A Testing Blueprint for Reliable Chat

## 1) Define the messenger contract (what “correct” means)

Before testing, lock the rules. These become your acceptance criteria.

### Core objects + states

* **Conversation**: id, participants, lastMessage, lastMessageAt
* **Message**: id, conversationId, senderId, body, attachments, createdAt, clientNonce (for de-dupe)
* **Delivery state** (recommended):

  * `sent` (server accepted)
  * `delivered` (reached recipient device session)
  * `read` (recipient opened conversation and saw it)
* **Unread rules**

  * Unread count per conversation = messages from others with `createdAt > lastReadAt(conversation)` (or messageId cursor)
  * Total badge = sum of conversation unreads (capped like “99+”)

### Messenger UI states (bottom-right)

* **Closed**: icon only + badge count
* **Docked panel open**: conversation list + optional chat window
* **Active conversation open**: messages view, typing, read receipts
* **Multiple mini-windows** (optional): like Messenger tabs

Testing becomes straightforward once these are explicit.

---

## 2) Must-have features checklist (Messenger MVP)

If you want “can be used as a messaging app,” these are the “don’t ship without” items ✅

### Realtime + sync

* New message arrives and:

  * increments badge if conversation not open
  * bumps conversation to top
  * shows preview text (“You: …” or sender name)
  * plays sound / toast (configurable)
* If the active conversation is open:

  * message appears instantly in-thread
  * unread does **not** increment for that convo
  * marks read appropriately (not too early)

### Message sending

* Optimistic UI: your message appears immediately with a “sending…” state
* Retry on failure (tap to retry)
* De-duplication: no duplicate messages when reconnect/resend

### Presence

* Online indicator (you said done) plus:

  * last seen (optional)
  * “typing…” (optional but expected)

### Read receipts (optional but expected)

* Per-message or per-conversation “Seen”
* Rules: only mark read when the conversation view is actually visible

### Notifications logic

* If user is on site but messenger closed: badge + toast
* If user is active in same conversation: no noisy toast (or softer)
* If user is away tab/background: browser notification (optional)

---

## 3) Testing strategy: pyramid + where bugs hide 🧱🐛

### A) Unit tests (fast, lots)

Test your **pure logic**:

* unread count calculations
* conversation sorting (lastMessageAt)
* dedupe rules (clientNonce / messageId)
* state reducers (open/close, select conversation, receive message)

### B) Integration tests (API + DB)

Test the **truth layer**:

* sending creates message correctly
* permission checks (only participants)
* pagination / cursors (infinite scroll)
* lastReadAt updates only when appropriate

### C) E2E tests (Playwright/Cypress)

Test **real user flows**:

* two users chatting in two browser contexts
* reconnect behavior
* cross-tab behavior

If you only do one category well, do E2E for messenger. Realtime UI bugs love to hide in the seams.

---

## 4) The test matrix (cover all bases)

Here’s the practical checklist I’d run through. If you implement these as E2E scenarios, you’re golden.

### Presence + session

1. User A logs in -> User B sees A online within N seconds
2. User A closes tab -> B sees A offline (with timeout rules)
3. A refreshes -> presence resumes cleanly (no duplicate “online” events)

### New message behavior (the heart of it)

1. B sends A a message while A:

   * (a) messenger closed -> badge increments + toast + conversation moves top
   * (b) messenger open, convo list visible, different convo selected -> badge on that convo + total badge
   * (c) currently viewing that convo -> message appears, no unread increment
   * (d) browser tab hidden -> badge increments, optional browser notification

### Read/unread correctness

1. A receives 3 messages while closed -> badge shows 3
2. A opens convo -> badge clears for that convo (and total updates)
3. A opens messenger but does **not** open convo -> unread remains
4. A scrolls up (old messages) while new arrives -> new message indicator appears without yanking scroll

### Sending + reliability

1. A sends message -> optimistic appears -> server confirms -> state becomes “sent”
2. Simulate server delay -> “sending…” persists -> then resolves
3. Simulate send failure -> message shows “failed” -> retry works
4. De-dupe: send same message twice via retry -> only one appears

### Ordering + pagination

1. Load conversation with 200 messages -> fetch newest -> scroll up loads older
2. Messages arriving while paginating -> no duplicates, ordering stable

### Multi-device / multi-tab (huge source of weirdness)

1. A open in two tabs:

* message arrives -> both tabs show it
* read in one tab -> other tab updates unread correctly

1. A on phone-like session + desktop session -> read states reconcile

### Permissions + safety

1. Non-participant cannot fetch conversation
2. Non-participant cannot send to conversation
3. Blocked user rules (if applicable): cannot message / cannot see typing/presence

### Edge cases (these save you from “it works on my machine”)

1. Reconnect after 30s offline:

* queued outbound sends
* inbound missed messages fetch via “since cursor”

1. Server sends duplicate event -> client ignores
2. Out-of-order events -> client orders by createdAt/messageId correctly
3. Deleted conversation / removed participant -> UI resolves gracefully

---

## 5) Implementation hooks that make testing sane

If you add these, your test life becomes 10x easier 🧰

* **Event types** (WebSocket/SSE):

  * `message:new`
  * `conversation:updated`
  * `presence:update`
  * `message:read` or `conversation:read`
* **Client cursor** per conversation:

  * last seen messageId or lastReadAt timestamp
* **Idempotency key** on send:

  * `clientNonce` generated client-side, stored server-side to dedupe
* **Reconciliation on connect**

  * On socket connect/reconnect: call `GET /sync?since=...` to fetch missed messages/events

---

## 6) A “done means done” acceptance list

If you want a crisp finish line, use this:

* ✅ Unread counts are always correct across refresh/reconnect
* ✅ New messages always show in the bottom-right component within 1s on normal network
* ✅ No duplicate messages even with retries/reconnect
* ✅ Active chat view never increments unread for that convo
* ✅ Conversation list ordering is always correct
* ✅ Multi-tab doesn’t cause doubled toasts or wrong badges

---

If you tell me your stack for realtime (WebSocket? SSE? Redis pubsub? Fiber?) and how your unread is tracked (lastReadAt vs message cursor), I can turn the above into a **concrete test spec** (Playwright scenario list + data setup + assertions) that matches your exact architecture 🔧✨

Progress: I implemented an initial subset of the plan in the frontend:

* Seed chat cache when opening a DM from a notification to avoid the Chat view getting stuck. See `frontend/src/hooks/useRealtimeNotifications.ts`.
* Added an unread-count utility and unit tests: `frontend/src/lib/chat-unread.ts` and `frontend/src/lib/__tests__/chat-unread.test.ts`.
* Added an integration-style test that simulates the notification -> open chat flow: `frontend/src/providers/__tests__/realtimeNotifications.chat.integration.test.tsx`.
* Added a test that asserts the `ChatDock` shows an unread indicator when a DM arrives: `frontend/src/components/chat/__tests__/chatDock.unreadIndicator.test.tsx` and added a `data-testid` to the badge in `ChatDock`.

Next suggested steps:

1. Expand unit tests to cover dedupe, ordering, and read-marking rules.
2. Add integration/E2E Playwright scenarios from the test matrix in section 4.
3. Implement a small client-side `lastRead` cursor per conversation (if backend supports it, prefer `lastReadMessageId`).
4. Add CI steps that run `bun install` then `make test-frontend`.

If you want, I can continue with step 1 (expand unit tests) now.
