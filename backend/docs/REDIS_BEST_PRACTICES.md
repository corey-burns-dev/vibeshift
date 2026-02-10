# Redis Best Practices (Canonical)

This is the canonical Redis guidance for backend work in this repository.

## Current Usage in Sanctum

- Rate limiting keys for selected endpoints.
- Cache-aside profile caching (`user:profile:{id}`).
- Pub/Sub channels for notifications/chat signaling.

## Key Naming Conventions

Use namespaced, readable keys:

- `user:profile:{id}`
- `post:detail:{id}`
- `post:list:page:{page}`
- `feed:user:{userID}:page:{page}`
- `chat:conv:{id}:messages:recent`
- `chat:user:{userID}:conversations`
- `chat:unread:{userID}:{convID}`
- `presence:conv:{id}`
- `typing:conv:{id}:{userID}`
- `rl:{route}:user:{id}` or `rl:{route}:ip:{ip}`

## TTL Strategy

Set TTLs intentionally per data class:

- Short-lived (30-120s): feed pages, post lists, typing/presence markers.
- Medium-lived (2-15m): profile snapshots, post details, recent conversation views.
- Long-lived: token/session keys set to token lifetime.
- No TTL only when persistence is explicitly required (for example selected counters).

## Usage Patterns

### Cache-aside for read-heavy endpoints

- Read from Redis first.
- On miss, fetch from DB and set cache with explicit TTL.
- On writes, invalidate affected keys explicitly.

### Presence and ephemeral state

- Use short TTL keys/sets and refresh via heartbeat.
- Avoid durable storage for ephemeral online state.

### Pub/Sub

- Use channels for fan-out signaling; do not treat channels as persisted storage.

### Negative caching

- For frequent not-found lookups, short TTL negative entries may be used (for example 30s).

## Operational Guidance

- Monitor hit/miss ratio and memory growth.
- Set `maxmemory` and a fitting eviction policy for workload.
- Keep cached payloads compact.
- Design for graceful behavior when Redis is unavailable.

## Implementation Notes

- Any new cache must define:
  - key format
  - TTL
  - invalidation strategy
- Avoid cache additions that do not include clear invalidation semantics.
