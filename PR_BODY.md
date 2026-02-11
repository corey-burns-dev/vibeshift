# What / Why

## Type

- [x] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Docs / CI / Chore

## Changes
**Summary (AI-generated):**
- Stabilizes CI and developer tooling: fixes the CI workflow and makes frontend linting CI-safe.
- Updates and bumps backend and frontend dependencies to current versions, and runs tests to validate compatibility.
- Removes incomplete service-layer scaffolding and cleans up implementation docs.
- Fixes a health-check bug and related README/architecture notes.
- Large frontend changes (UI components, hooks, and pages) and refactors across ~117 files.

**Commits (selection):**
- chore(scripts): add PR body generator and PR upsert script
- chore: ignore dist and make frontend lint CI-safe
- chore: update implementation checklist and biome.json
- chore(makefile): run backend dependency updates inside container to avoid host/container Go version drift
- chore(deps): update backend and frontend dependencies; run tests
- ci: use Go 1.25 for backend checks
- chore: remove incomplete service layer scaffolding
- fix: ci workflow, readme architecture, and health check bug

**Diffstat:**
```
 .github/dependabot.yml                             |   58 +-
 .github/workflows/ci.yml                           |    6 +-
 .gitignore                                         |    6 +
 Makefile                                           |    9 +-
 PR_BODY.md                                         |  156 ++
 README.md                                          |    2 +-
 backend/go.mod                                     |   17 +-
 backend/go.sum                                     |   34 +-
 backend/internal/server/server.go                  |    4 +-
 docs/IMPLEMENTATION_CHECKLIST.md                   |  199 +-
 frontend/.biomeignore                              |    8 +
 frontend/biome.json                                |  128 +-
 frontend/bun.lock                                  |   16 +-
 frontend/package.json                              |  126 +-
 frontend/postcss.config.cjs                        |    4 +-
 frontend/src/App.tsx                               |  707 +++----
 frontend/src/api/client.ts                         |  923 ++++-----
 frontend/src/api/throw-away.js                     |  266 +--
 frontend/src/api/types.ts                          |  280 +--
 frontend/src/components/AuthLayout.tsx             |   38 +-
 frontend/src/components/BottomBar.tsx              |   94 +-
 frontend/src/components/ErrorBoundary.tsx          |  176 +-
 frontend/src/components/MobileHeader.tsx           |   76 +-
 frontend/src/components/Navbar.tsx                 |  187 +-
 frontend/src/components/ProtectedRoute.tsx         |   40 +-
 frontend/src/components/Sidebar.tsx                |  312 +--
 frontend/src/components/TopBar.tsx                 |  377 ++--
 frontend/src/components/UserContextMenu.tsx        |  217 +-
 frontend/src/components/UserMenu.tsx               |  227 ++-
 frontend/src/components/chat/ChatSidebar.tsx       |  224 +--
 frontend/src/components/chat/MessageItem.tsx       |  101 +-
 frontend/src/components/chat/MessageList.test.tsx  |  141 +-
 frontend/src/components/chat/MessageList.tsx       |   60 +-
 frontend/src/components/chat/ParticipantsList.tsx  |   86 +-
 frontend/src/components/friends/FriendCard.tsx     |  247 +--
 frontend/src/components/friends/FriendList.tsx     |  187 +-
 frontend/src/components/friends/FriendRequests.tsx |  236 +--
 frontend/src/components/friends/FriendSidebar.tsx  |  168 +-
 frontend/src/components/mode-toggle.tsx            |   48 +-
 frontend/src/components/navigation.ts              |   84 +-
 frontend/src/components/posts/PostCaption.tsx      |   68 +-
 frontend/src/components/posts/PostComments.tsx     |  367 ++--
 frontend/src/components/theme-provider.tsx         |    7 +-
 frontend/src/components/ui/avatar.tsx              |   51 +-
 frontend/src/components/ui/badge.tsx               |   42 +-
 frontend/src/components/ui/button.tsx              |   78 +-
 frontend/src/components/ui/card.tsx                |   97 +-
 frontend/src/components/ui/context-menu.tsx        |  265 +--
 frontend/src/components/ui/dialog.tsx              |  141 +-
 frontend/src/components/ui/dropdown-menu.tsx       |  265 +--
 frontend/src/components/ui/input.tsx               |   26 +-
 frontend/src/components/ui/label.tsx               |   13 +-
 frontend/src/components/ui/scroll-area.tsx         |   33 +-
 frontend/src/components/ui/select.tsx              |  211 +-
 frontend/src/components/ui/sonner.tsx              |   36 +-
 frontend/src/components/ui/table.tsx               |  136 +-
 frontend/src/components/ui/tabs.tsx                |   60 +-
 frontend/src/components/ui/textarea.tsx            |   29 +-
 frontend/src/hooks/useAudio.ts                     |   94 +-
 frontend/src/hooks/useAuth.ts                      |   80 +-
 frontend/src/hooks/useChat.ts                      |  445 +++--
 frontend/src/hooks/useChatWebSocket.ts             |  869 ++++----
 frontend/src/hooks/useComments.ts                  |  172 +-
 frontend/src/hooks/useFriends.ts                   |  170 +-
 frontend/src/hooks/useGameRoomSession.ts           |  422 ++--
 frontend/src/hooks/useGames.ts                     |   40 +-
 frontend/src/hooks/usePosts.ts                     |  376 ++--
 frontend/src/hooks/usePresence.ts                  |  186 +-
 frontend/src/hooks/useRealtimeNotifications.ts     |  718 +++----
 frontend/src/hooks/useStreams.ts                   |  190 +-
 frontend/src/hooks/useUserActions.ts               |  171 +-
 frontend/src/hooks/useUsers.ts                     |  251 +--
 frontend/src/hooks/useVideoChat.ts                 |  765 +++----
 frontend/src/lib/chat-utils.ts                     |   85 +-
 frontend/src/lib/handleAuthOrFKError.ts            |   52 +-
 frontend/src/lib/logger.ts                         |   74 +-
 frontend/src/lib/utils.test.ts                     |   24 +-
 frontend/src/lib/utils.ts                          |    2 +-
 frontend/src/lib/validations.ts                    |  135 +-
 frontend/src/main.tsx                              |   60 +-
 frontend/src/pages/Chat.tsx                        | 2093 ++++++++++----------
 frontend/src/pages/Friends.tsx                     |   69 +-
 frontend/src/pages/Games.tsx                       |  833 ++++----
 frontend/src/pages/Login.tsx                       |  201 +-
 frontend/src/pages/Messages.tsx                    | 1254 ++++++------
 frontend/src/pages/PostDetail.tsx                  |  231 ++-
 frontend/src/pages/Posts.tsx                       |  988 ++++-----
 frontend/src/pages/Profile.tsx                     |  827 ++++----
 frontend/src/pages/Signup.tsx                      |  278 +--
 frontend/src/pages/Stream.tsx                      |  880 ++++----
 frontend/src/pages/Streams.tsx                     |  610 +++---
 frontend/src/pages/UserProfile.tsx                 |  351 ++--
 frontend/src/pages/Users.tsx                       |  343 ++--
 frontend/src/pages/VideoChat.tsx                   |  578 +++---
 frontend/src/pages/games/Battleship.tsx            |    2 +-
 frontend/src/pages/games/Blackjack.tsx             |    2 +-
 frontend/src/pages/games/Checkers.tsx              |    2 +-
 frontend/src/pages/games/Chess.tsx                 |    2 +-
 frontend/src/pages/games/ConnectFour.tsx           | 1367 ++++++-------
 frontend/src/pages/games/CrazyEights.tsx           |    2 +-
 frontend/src/pages/games/DrawAndGuess.tsx          |    2 +-
 frontend/src/pages/games/Hearts.tsx                |    2 +-
 frontend/src/pages/games/Othello.tsx               |    2 +-
 frontend/src/pages/games/Placeholder.tsx           |   68 +-
 frontend/src/pages/games/Poker.tsx                 |    2 +-
 frontend/src/pages/games/President.tsx             |    2 +-
 frontend/src/pages/games/Snake.tsx                 |    2 +-
 frontend/src/pages/games/Trivia.tsx                |    2 +-
 frontend/src/test/setup.ts                         |   56 +-
 frontend/src/utils/prefetch.ts                     |   79 +-
 frontend/tailwind.config.cjs                       |    9 +-
 frontend/tsconfig.json                             |   48 +-
 frontend/vite.config.ts                            |  124 +-
 frontend/vitest.config.ts                          |    2 +-
 issues_and_agent_prompts.md                        |  382 ++++
 scripts/gen_pr_body.sh                             |   82 +
 scripts/pr_upsert.sh                               |   22 +
 117 files changed, 13329 insertions(+), 12051 deletions(-)
```

## How to Test

1. Pull branch and run:
   - `make fmt` (or `make fmt-frontend`)
   - `make lint` (or `make lint-frontend`)
   - `make test` (or your app’s test commands)
2. Manually verify any UI/API paths touched by the changed files.

## Checklist

- [ ] Lint passes
- [ ] Tests pass
- [ ] No behavior changes during refactor
- [ ] Screenshots/logs attached if applicable
- [ ] Migration required (likely: no)
- [ ] Reviewed my own diff
