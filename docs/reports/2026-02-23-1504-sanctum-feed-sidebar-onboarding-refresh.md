## Metadata

- Date: `2026-02-23`
- Branch: `main`
- Author/Agent: `Codex (GPT-5)`
- Scope: `Frontend routes, feed behavior, sidebar density, onboarding sanctum selection UX, tests`

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend"],
  "Lessons": [
    {
      "title": "Route intent should be encoded in explicit mode props and route tests",
      "severity": "HIGH",
      "anti_pattern": "A feed route intended for subscribed sanctums rendered the all-posts mode due to a mismatched prop.",
      "detection": "rg -n \"path='/feed'|Posts mode\" frontend/src/App.tsx frontend/src/**/*.test.tsx",
      "prevention": "Co-locate route-mode assertions in dedicated route tests and verify both home and feed paths whenever route wiring changes."
    },
    {
      "title": "Sanctum browse density should avoid hard caps that hide default seeded sanctums",
      "severity": "MEDIUM",
      "anti_pattern": "Sidebar sanctum list used a fixed slice cap, which prevented full discoverability.",
      "detection": "rg -n \"slice\(0, 14\)|posts-sidebar-sanctum-links\" frontend/src/pages/Posts.tsx frontend/src/pages/Posts.sidebar.test.tsx",
      "prevention": "Render complete sanctum list in compact grid and enforce non-truncation with a dedicated sidebar test."
    }
  ]
}
```

## Summary

- Requested: Reddit-style sanctum feed behavior, feed/home separation, compact sidebar/onboarding sanctum UIs, and tests.
- Delivered: New sanctum feed page and route mapping, `/feed` membership behavior, preserved legacy detail page on new manage route, denser feed sidebar + mobile drawer sanctum links, compact onboarding selectable capsules with whole-capsule toggles, and expanded test coverage.

## Changes Made

- Added `frontend/src/pages/SanctumFeed.tsx`:
  - Resolves slug via `useSanctum`.
  - Handles loading/error/not-found states.
  - Renders scoped posts via `Posts sanctumId={...}`.
  - Adds lightweight header and manage link.
- Updated `frontend/src/App.tsx`:
  - `/feed` now renders `Posts mode='membership'`.
  - `/s/:slug` now renders `SanctumFeed`.
  - New legacy management route: `/sanctums/:slug/manage` -> `SanctumDetail`.
- Updated `frontend/src/pages/Posts.tsx`:
  - Compact left sidebar spacing/typography.
  - Removed sanctum truncation cap and rendered full sanctum list.
  - Added `aria-current` for active sanctum links.
  - Matched compact style in mobile sanctum drawer.
  - Added `data-testid='posts-sidebar-sanctum-links'` for test targeting.
- Updated `frontend/src/pages/OnboardingSanctums.tsx`:
  - Replaced larger card + checkbox row with compact capsule-style toggles.
  - Whole capsule click toggles selection.
  - Added accessible semantics (`role='checkbox'`, `aria-checked`, label).
  - Kept payload logic and mobile pagination flow.
- Tests:
  - Updated `frontend/src/App.feed-routes.test.tsx` for `/feed` membership mode.
  - Added `frontend/src/pages/SanctumFeed.test.tsx`.
  - Updated `frontend/src/pages/SanctumRoutes.test.tsx` for new feed/manage route split.
  - Added `frontend/src/pages/Posts.sidebar.test.tsx` for non-truncation/link/active-state behavior.
  - Updated `frontend/src/pages/OnboardingSanctums.test.tsx` for capsule click-toggle semantics.

## Validation

- Commands run:
  - `cd frontend && bun run test:run src/App.feed-routes.test.tsx src/pages/SanctumFeed.test.tsx src/pages/SanctumRoutes.test.tsx src/pages/OnboardingSanctums.test.tsx src/pages/Posts.sidebar.test.tsx`
  - `make test-frontend`
  - `cd frontend && bun run type-check`
- Test results:
  - Targeted tests: passed (13/13).
  - Full frontend tests: passed (217/217).
  - Type-check: passed.
- Manual verification:
  - Not executed in browser session; behavior validated through route/component tests.

## Risks and Regressions

- Known risks:
  - Sanctum feed now relies on slug lookup before rendering posts, adding one query dependency.
- Potential regressions:
  - Route assumptions in external links/bookmarks to old `SanctumDetail` at `/s/:slug` are now changed.
- Mitigations:
  - Legacy detail remains available at `/sanctums/:slug/manage`.
  - Route tests added for both new feed route and preserved manage route.

## Follow-ups

- Remaining work:
  - Optional UX follow-up: add explicit breadcrumb/back-link from manage page to `/s/:slug`.
- Recommended next steps:
  - Add a short in-app affordance on manage page if users need clearer discoverability after route split.

## Rollback Notes

- Revert route changes in `frontend/src/App.tsx` and point `/s/:slug` back to `SanctumDetail`.
- Remove `SanctumFeed.tsx` and related tests.
- Restore old sidebar and onboarding component structure if UI compaction must be rolled back.
