# Sanctum Production Review - 2026-02-11

## 🎯 Executive Summary
Risk Level: MEDIUM
Issues Found: 0 critical, 2 high, 3 medium
Recommendation: CONDITIONAL GO (Fix high priority issues before scale)

The Sanctum codebase is in a very strong state with many production-grade features already implemented. Security is robust, observability is excellent, and WebSocket scaling is well-architected. The main risks are performance-related (N+1 queries and missing database indexes) and minor testing/frontend security improvements.

## 🔴 CRITICAL (Must Fix)
None found.

## 🟡 HIGH PRIORITY (Should Fix)
1. ❌ **N+1 Query Problem**
   - Location: `backend/internal/repository/post.go:102` (`populatePostDetails`)
   - Risk: HIGH (Performance). Every post list request (home feed, user posts, sanctum posts) triggers 3 additional database queries for *every* post. A list of 50 posts results in 150 extra queries.
   - Fix: Use SQL joins or subqueries in the main list query to fetch `CommentsCount`, `LikesCount`, and `Liked` status in a single round trip.

2. ❌ **Missing Database Indexes**
   - Location: `backend/internal/database/migrations/000000_core.up.sql`
   - Risk: HIGH (Performance). Foreign key columns (`posts.user_id`, `posts.sanctum_id`, `comments.post_id`, `messages.conversation_id`) lack explicit indexes. As the database grows, list operations will transition to full table scans.
   - Fix: Add `CREATE INDEX` statements for all foreign key columns used in `WHERE` or `JOIN` clauses.

## 🟢 MEDIUM PRIORITY (Fix Soon)
1. ⚠️ **Race Detection Disabled in Tests**
   - Location: `Makefile` (`test-backend` target)
   - Risk: MEDIUM (Stability). Concurrent code (WebSockets, Notifiers) is used heavily, but the race detector is not enabled in the primary test command.
   - Fix: Add `-race` flag to `go test` commands in `Makefile`.

2. ⚠️ **Insecure JWT Token Storage**
   - Location: `frontend/src/api/client.ts`
   - Risk: MEDIUM (Security). Tokens are stored in `localStorage`, making them vulnerable to XSS.
   - Fix: Consider moving to HttpOnly cookies or a more secure in-memory storage strategy with refresh token rotation (which the backend already supports).

3. ⚠️ **Unbounded GameHub Rooms**
   - Location: `backend/internal/notifications/game_hub.go`
   - Risk: MEDIUM (Reliability). Unlike `VideoChatHub`, `GameHub` does not enforce limits on the number of active rooms or total connections, which could lead to memory exhaustion.
   - Fix: Implement `MaxTotalRooms` and `MaxPeersPerRoom` limits similar to `VideoChatHub`.

## ✅ STRENGTHS
- **Security**: Robust JWT validation (signing method checks, issuer/audience validation) and a single-use "ticket" system for WebSockets.
- **Observability**: Structured JSON logging (slog), Prometheus metrics integration, and comprehensive health checks.
- **WebSockets**: Multi-device support in `ChatHub`, heartbeat mechanisms, backpressure handling, and Redis-backed horizontal scaling.
- **Deployment**: Secure multi-stage Docker builds using Google's `distroless` base images and non-root users.
- **Configuration**: Fail-fast validation at startup ensuring critical secrets and passwords are set for production.

## 📋 Deployment Checklist
- [ ] Refactor `populatePostDetails` to avoid N+1 queries.
- [ ] Apply missing database indexes to foreign keys.
- [ ] Enable `-race` detector in CI/CD and local test suite.
- [ ] Verify `ALLOWED_ORIGINS` is restricted in production `.env`.
- [ ] Confirm `JWT_SECRET` meets minimum length requirements (>= 32 chars).

## 🔮 Future Improvements
- Implement Read Replica connection in repository layer (infrastructure is already in place).
- Add request-level rate limiting (global limit is present, but per-route tuning could be improved).
- Migrate from `localStorage` to HttpOnly cookies for session management.
