# HMR 401 Redirect Loop Fix

## Metadata

- Date: `2026-02-17`
- Branch: master
- Author/Agent: Claude (claude-sonnet-4-5)
- Scope: Frontend auth — API client, token validation hook, ProtectedRoute

## Structured Signals

```json
{
  "Report-Version": "1.0",
  "Domains": ["frontend", "auth", "websocket"],
  "Lessons": [
    {
      "title": "Hard window.location redirects in API clients cause reload loops with HMR",
      "severity": "HIGH",
      "anti_pattern": "Calling window.location.href inside an API client's 401 handler. On Vite HMR, WebSocket-related module changes trigger a full page reload. The reload re-initialises React Query and Zustand, fires token validation, which may 401 → redirect → reload again.",
      "detection": "rg -n \"window.location\" frontend/src/api/",
      "prevention": "API clients should only throw errors on 401. Navigation must be owned by React (Navigate component or router.push). The API client should clear auth store state but never redirect."
    },
    {
      "title": "useQuery without refetchOnWindowFocus: false re-validates on every HMR focus event",
      "severity": "MEDIUM",
      "anti_pattern": "Token validation queries with refetchOnWindowFocus defaulting to true. Vite HMR emits a window focus event after injecting updates, causing an extra network round-trip on every file save even when staleTime has not elapsed.",
      "detection": "rg -n \"useValidateToken\\|refetchOnWindowFocus\" frontend/src/hooks/",
      "prevention": "Set refetchOnWindowFocus: false on auth validation queries. Validation should be driven by mount and explicit user action, not window focus."
    },
    {
      "title": "Missing initialData on token validation query causes unnecessary loading spinner on HMR reloads",
      "severity": "LOW",
      "anti_pattern": "useValidateToken starts with isLoading: true on every full-page HMR reload because the React Query cache is in-memory and destroyed. ProtectedRoute shows 'Validating session...' on every file save, interrupting the user's flow.",
      "detection": "rg -n \"initialData\" frontend/src/hooks/useUsers.ts",
      "prevention": "Provide initialData via a local JWT expiry check (atob + exp field). Data has no initialDataUpdatedAt so it is immediately stale and the background refetch still fires — but isLoading starts false, so the spinner is skipped."
    }
  ]
}
```

## Summary

**Problem:** Editing WebSocket-related files (hooks, utilities) triggers a Vite HMR full page reload because those modules lack HMR boundaries. On reload:

1. Zustand rehydrates from localStorage (`_hasHydrated` starts false → true).
2. React Query cache is destroyed; `QueryClient` is recreated in `main.tsx`.
3. `useValidateToken` fires with `isLoading: true`.
4. ProtectedRoute shows the spinner.
5. `apiClient.getCurrentUser()` → `GET /users/me` → 401 (expired token or concurrent WebSocket connection racing the validation).
6. The API client attempts `performRefresh()`. If refresh fails, it calls `window.location.href = '/login'` — **a hard redirect that destroys React state** and starts the cycle over.

**Fix:** Three coordinated changes that together eliminate the loop and the unnecessary spinner.

## Changes Made

### 1. `frontend/src/api/client.ts` — Remove hard redirect on 401 refresh failure

**Lines 166–170.** Removed `window.location.href = '/login'`. Auth store is still cleared (`useAuthSessionStore.getState().clear()` + `localStorage.removeItem('user')`). Execution now falls through to `throw new ApiError(...)`.

`ProtectedRoute` detects `!isAuthenticated` (the store's `accessToken` is now null) and renders `<Navigate to='/login' replace>` — a soft React redirect that preserves in-memory state.

```diff
-          // If refresh fails, clear auth and redirect to login
           useAuthSessionStore.getState().clear()
           localStorage.removeItem('user')
-          window.location.href = '/login'
+          // React handles the redirect via ProtectedRoute — no hard reload
```

### 2. `frontend/src/hooks/useUsers.ts` — `refetchOnWindowFocus: false` on `useValidateToken`

Vite HMR emits a window focus event after module injection. With the default `refetchOnWindowFocus: true`, the validation query refires on every file save. Now suppressed.

### 3. `frontend/src/hooks/useUsers.ts` — `initialData` on `useValidateToken`

On a full-page HMR reload, the React Query cache is empty and `isLoading` starts true, blocking ProtectedRoute with a spinner. The `initialData` factory decodes the JWT locally:

```typescript
initialData: () => {
  if (!token) return undefined
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return undefined
    const payload = JSON.parse(atob(parts[1]))
    return payload.exp > Date.now() / 1000 ? true : undefined
  } catch {
    return undefined
  }
},
```

- If the JWT is locally unexpired → `initialData = true` → `isLoading: false` → spinner skipped, children render immediately.
- The query is still immediately stale (no `initialDataUpdatedAt`) so the background refetch fires on mount.
- If the server returns 401, `queryFn` catches the `ApiError`, clears auth store, returns `false` → `tokenValid === false` → `<Navigate to='/login'>`.

## Validation

- Manual: edit a WebSocket hook file, observe HMR reload — no redirect loop, no spinner, protected content renders immediately.
- Manual: with an expired token, after HMR reload the user is redirected to `/login` via React router without a hard reload.
- No new tests required; the existing `useValidateToken` and `ProtectedRoute` contract is unchanged — the hook still returns `true`/`false`/`undefined` and `isLoading`.

## Risks and Regressions

| Risk | Likelihood | Mitigation |
|---|---|---|
| 401 from a non-validate API call (e.g. POST /messages) no longer hard-redirects; caller sees an ApiError instead | Low — callers handle errors via React Query mutation/query error states | ProtectedRoute redirects as soon as `isAuthenticated` goes false from store clear |
| `initialData: true` briefly shows protected content if token expired server-side but not locally | Very low — JWTs have clock-based expiry; local check is accurate within clock skew | Background refetch confirms and redirects within one round-trip |
| `refetchOnWindowFocus: false` means tab-switching no longer re-validates | Acceptable — `staleTime: 30s` + `refetchOnMount: true` provide sufficient coverage | Can be re-enabled if future requirements demand it |

## Follow-ups

- Consider adding a global React Query `onError` handler for `ApiError` status 401 as a belt-and-suspenders redirect for any query that leaks outside ProtectedRoute.
- `performRefresh` returns `null` silently when the refresh endpoint is unreachable — could surface a more specific error type to callers.

## Rollback Notes

Revert the two files to their pre-change state:

```
git checkout HEAD -- frontend/src/api/client.ts frontend/src/hooks/useUsers.ts
```

Restoring `window.location.href = '/login'` re-enables the hard redirect on refresh failure. The `initialData` and `refetchOnWindowFocus` options can be independently reverted without side effects.
