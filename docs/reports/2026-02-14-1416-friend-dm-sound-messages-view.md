# Friend DM Sound Gating in Messages View

## Metadata

- Date: `2026-02-14`
- Branch: `unknown`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Frontend chat unread/sound behavior for friend DMs in Messages view`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "websocket"],
  "Lessons": [
    {
      "title": "Centralize unread transitions to prevent duplicate DM sound triggers",
      "severity": "HIGH",
      "anti_pattern": "Multiple subscribers independently increment unread and play sounds for the same WebSocket event",
      "detection": "rg -n \"subscribeOnMessage\\(|playNewMessageSound\\(|incrementUnread\\(\" frontend/src",
      "prevention": "Use provider-owned unread state and gate DM sound by route + friend DM + unread 0->1"
    }
  ]
}
```

## Summary

- What was requested.
  - Play DM sound only for friend DMs in Messages view and only on unread transition `0 -> 1`.
- What was delivered.
  - Added a shared sound-decision helper, moved DM unread ownership into `ChatProvider`, and rewired Chat/Dock + tests to use provider unread APIs.

## Changes Made

- Key implementation details.
  - Added `shouldPlayFriendDMInMessagesView(...)` in `frontend/src/lib/chat-sounds.ts`.
  - Added provider unread state and APIs (`unreadByConversation`, `getUnread`, `incrementUnread`, `clearUnread`) in `frontend/src/providers/ChatProvider.tsx`.
  - Updated `frontend/src/pages/Chat.tsx` to:
    - detect Messages view route,
    - increment provider unread for unseen DMs,
    - gate DM sound with the new helper,
    - clear unread on conversation open,
    - use `playRoomAlertSound()` for room alerts.
  - Updated `frontend/src/components/chat/ChatDock.tsx` to use provider unread APIs and avoid duplicate unread transitions while Chat page is active.
  - Updated unread consumers (`frontend/src/components/chat/ChatDockConversationList.tsx`, `frontend/src/components/BottomBar.tsx`) to read provider unread state.
  - Updated tests in:
    - `frontend/src/providers/ChatProvider.integration.test.tsx`
    - `frontend/src/components/chat/ChatDock.test.tsx`
    - `frontend/src/components/chat/ChatDockConversationList.test.tsx`
    - `frontend/src/lib/chat-sounds.test.ts`

## Validation

- Commands run:
  - `cd frontend && bun run test:run src/providers/ChatProvider.integration.test.tsx --reporter verbose`
  - `make test-frontend`
  - `make lint-frontend`
  - `cd frontend && bun run type-check`
- Test results:
  - All targeted and full frontend tests passed.
  - Type-check passed.
- Manual verification:
  - Not executed in-browser in this session.

## Risks and Regressions

- Known risks:
  - `/messages` currently redirects to `/chat`; route detection now treats both as Messages view.
- Potential regressions:
  - If friend list loading is delayed, DM sound is conservatively suppressed until friend data resolves.
- Mitigations:
  - Integration/unit tests cover route gating and unread `0 -> 1` semantics.

## Follow-ups

- Remaining work:
  - Optional manual smoke checks in browser for `/chat` route with real WS traffic.
- Recommended next steps:
  - Add cross-tab dedupe if simultaneous tabs become noisy.

## Rollback Notes

- How to revert safely if needed.
  - Revert this report and frontend file changes in one commit; no backend schema or API contract changes were introduced.
