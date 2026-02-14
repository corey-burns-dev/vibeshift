# Frontend Patterns

## Data Flow

- Keep server interaction in API layer + hooks.
- Prefer TanStack Query for server state.
- Use stable query keys and explicit invalidation.

## State

- Avoid duplicating server state into local state unless required for UX.
- Keep optimistic updates rollback-safe.

## UI

- Extend existing Tailwind and component patterns.
- Preserve accessibility baseline (keyboard, labels, focus-visible).

## Error Handling

- Handle API failures with consistent UX feedback.
- Avoid broad auth invalidation for non-auth domain errors.

## Validation Checklist

- No direct fetch logic in render paths where shared hooks exist.
- Loading/empty/error states present for new async views.
- No noisy debug logging in production paths.
