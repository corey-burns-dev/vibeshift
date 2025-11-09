# Redis Key Conventions & TTLs

This document lists recommended key naming conventions and TTLs for the Vibeshift backend Redis usage.

Guiding principles
- Use short, namespaced keys: `resource:entity:identifier`.
- Keep values small (IDs or compact JSON). Avoid storing large blobs.
- Set TTL for ephemeral data; persist only what you need.

Recommended keys
- `user:profile:<id>` — JSON snapshot of user profile. TTL: 5m
- `post:detail:<id>` — JSON snapshot of a post. TTL: 2m
- `post:list:page:<page>` — cached page of recent posts. TTL: 60s (stale-while-revalidate can be used)
- `feed:user:<userID>:page:<page>` — personalized feed page. TTL: 30s
- `notif:unread:<userID>` — integer count of unread notifications. TTL: none (update on read)
- `notifications:user:<userID>` — pub/sub channel (not stored key)
- `rl:<route>:user:<id>` or `rl:<route>:ip:<ip>` — rate-limiter counters. TTL: sliding window (e.g. 1m)
- `refresh:user:<userID>` — current refresh token jti for user (or map). TTL: refresh token lifetime (e.g., 7d)
- `presence:user:<userID>` — ephemeral presence flag (value may be timestamp). TTL: 30s

Negative caching
- For not-found results (e.g., user not found), consider storing `null` or `"__nil__"` with a short TTL (30s) to avoid repeated DB hits.

TTL recommendations
- Short-lived (seconds): UI feed pages, post lists (30–120s)
- Medium (minutes): user profiles, post details (5–15m) depending on update frequency
- Long (hours→days): refresh tokens (if stored server-side) — set to token lifetime

Operational notes
- Monitor `keyspace_hits` / `keyspace_misses` for cache effectiveness.
- Choose an eviction policy based on expected dataset and whether keys have TTLs (`allkeys-lru` is common).
- Use `maxmemory` and monitor memory usage; avoid storing large objects.
