---
name: Fix Messages 403 Loop
overview: Fix an infinite request loop on the Messages page where `markAsRead.mutate()` fires repeatedly because the mutation object is in the useEffect dependency array, and each 403 error response changes the mutation state, re-triggering the effect.
todos:
  - id: fix-infinite-loop
    content: In Messages.tsx, add a ref guard to the mark-as-read useEffect and remove `markAsRead` from its dependency array to prevent infinite re-fires
    status: completed
  - id: fix-error-handler
    content: In useChat.ts useMarkAsRead, silently swallow 403 errors instead of treating them as auth failures via handleAuthOrFKError
    status: completed
isProject: false
---

# Fix Messages Page 403 Infinite Request Loop

## Root Cause Analysis

There are two interacting bugs:

### Bug 1: Infinite loop in `useEffect` (primary cause of console spam)

In [Messages.tsx](frontend/src/pages/Messages.tsx), lines 175-178:

```175:178:frontend/src/pages/Messages.tsx
  useEffect(() => {
    if (!canAccessSelectedConversation || !selectedConversationId) return
    markAsRead.mutate(selectedConversationId)
  }, [canAccessSelectedConversation, selectedConversationId, markAsRead])
```

`markAsRead` is the **entire mutation result object** from TanStack Query's `useMutation`. This object gets a **new reference** every time the mutation state changes (idle -> pending -> error). So:

1. Effect fires, calls `markAsRead.mutate(19)`
2. Mutation state changes to `pending` -- new `markAsRead` object reference
3. Effect re-fires (dependency changed), calls `markAsRead.mutate(19)` again
4. Request returns 403, state changes to `error` -- another new reference
5. Effect re-fires again -- infinite loop

### Bug 2: 403 treated as session-invalid (secondary)

In [useChat.ts](frontend/src/hooks/useChat.ts), `useMarkAsRead`'s `onError` calls `handleAuthOrFKError(error)`. That function in [handleAuthOrFKError.ts](frontend/src/lib/handleAuthOrFKError.ts) treats **any** 403 as a session failure -- it clears auth state, shows an alert, and redirects to `/login`. But the backend returns 403 from `/conversations/:id/read` when the user is simply "not a participant" in that conversation, which is **not** an auth/session error.

## Planned Fixes

### Fix 1: Eliminate the infinite loop in Messages.tsx

Use a ref to track the last conversation ID that was marked as read, preventing re-fires. Remove `markAsRead` from the dependency array entirely:

```tsx
const lastMarkedReadRef = useRef<number | null>(null)

useEffect(() => {
  if (!canAccessSelectedConversation || !selectedConversationId) return
  if (lastMarkedReadRef.current === selectedConversationId) return
  lastMarkedReadRef.current = selectedConversationId
  markAsRead.mutate(selectedConversationId)
}, [canAccessSelectedConversation, selectedConversationId])
```

Also reset the ref when conversation changes:

```tsx
// Reset when conversation changes so re-entering marks it read again
useEffect(() => {
  lastMarkedReadRef.current = null
}, [selectedConversationId])
```

(Or more simply, the guard `lastMarkedReadRef.current === selectedConversationId` already handles conversation switches since the ID would differ.)

### Fix 2: Don't treat mark-as-read 403 as auth failure

In [useChat.ts](frontend/src/hooks/useChat.ts), change `useMarkAsRead`'s `onError` to silently swallow 403 errors (non-participant is not a session problem). Only propagate actual auth errors (401):

```tsx
onError: error => {
  // 403 from mark-as-read means "not a participant" -- not an auth failure.
  // Silently ignore to avoid false session invalidation.
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) return
  handleAuthOrFKError(error)
},
```

## Files Changed

- [frontend/src/pages/Messages.tsx](frontend/src/pages/Messages.tsx) -- fix useEffect deps / add ref guard
- [frontend/src/hooks/useChat.ts](frontend/src/hooks/useChat.ts) -- soften error handling in `useMarkAsRead`

