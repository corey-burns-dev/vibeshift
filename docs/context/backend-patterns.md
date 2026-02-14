# Backend Patterns

## Core Flow

- Prefer `handler -> service -> repository` separation.
- Keep handler logic thin and focused on transport concerns.

## Error Handling

- Never ignore Go/GORM errors.
- Wrap actionable errors with context.
- Return stable API error shapes.

## Database

- Validate foreign key existence where needed before write.
- Use explicit limits for list endpoints.
- Keep transactions bounded and rollback-safe.

## Redis and Caching

- Define key shape, TTL, and invalidation for each cache key.
- Do not introduce cache writes without fallback behavior.

## Realtime

- Guard goroutines with cancellation/recovery where appropriate.
- Use bounded fanout/backpressure-aware messaging paths.

## Validation Checklist

- No `_ = ...Error` in modified paths.
- No unbounded list reads in changed repository methods.
- Auth/authz checks enforced for user-owned resources.
