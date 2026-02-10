# Project Implementation Checklist

## 🔴 Critical - Tier 1: Production Readiness

### Observability & Monitoring

- [ ] **Implement Custom Prometheus Metrics**
  - Add custom collectors for Redis error rates
  - Track database query P95 latency
  - Monitor WebSocket connection counts per room
  - Track message throughput rates

- [ ] **Add Distributed Tracing**
  - Integrate OpenTelemetry for end-to-end request tracing
  - Trace requests through API → Service → Database → Redis
  - Add trace context propagation across WebSocket connections
  - Configure sampling rates for production

- [ ] **Enhance Logging Coverage**
  - Add structured logging to all repository methods
  - Log WebSocket connection lifecycle events (connect, disconnect, errors)
  - Include correlation IDs in all async operations

### Database & Caching

- [ ] **Implement Read/Write Database Separation**
  - Configure GORM with separate read replica connections
  - Route all SELECT queries to read replicas
  - Ensure write operations use primary database
  - Add fallback logic if read replica is unavailable

- [ ] **Migrate from Auto-Migration to Controlled Migrations**
  - Remove GORM AutoMigrate from production code
  - Implement migration tool (e.g., golang-migrate, goose)
  - Create rollback procedures for all migrations
  - Add migration version tracking

- [ ] **Define Caching Strategy with TTLs**
  - Cache user profiles with 5-minute TTL
  - Cache room metadata with 10-minute TTL
  - Cache message history (last 50 messages) with 2-minute TTL
  - Implement cache invalidation on user updates
  - Implement cache invalidation on room updates
  - Add cache-aside pattern for all read-heavy operations

### Authentication & Security

- [ ] **Implement JWT Refresh Token Strategy**
  - Create refresh token endpoint (`POST /auth/refresh`)
  - Store refresh tokens in Redis with 30-day TTL
  - Reduce access token lifetime from 7 days to 15 minutes
  - Implement refresh token rotation

- [ ] **Add Token Revocation Support**
  - Create token blacklist in Redis
  - Add logout endpoint that blacklists current token
  - Add "logout all sessions" functionality
  - Implement token blacklist cleanup job

- [ ] **Enforce WebSocket Connection Limits**
  - Limit users to 10 concurrent WebSocket connections
  - Track connections per user in Redis
  - Add connection cleanup on disconnect
  - Implement server-side heartbeat (ping/pong every 30s)

## 🟡 High Priority - Tier 2: Scale-Ready Architecture

### Code Architecture

- [ ] **Introduce Service Layer**
  - Create `/internal/service` package
  - Extract business logic from handlers to service layer
  - Pattern: Handler → Service → Repository
  - Handlers should only handle I/O, validation, and serialization
  - Services should contain all business rules and orchestration

- [ ] **Refactor to Use API Contracts as Source of Truth**
  - Generate server stubs from OpenAPI spec
  - Generate client SDKs from OpenAPI spec
  - Enforce spec-first development workflow
  - Add CI validation that code matches spec

### Background Processing

- [ ] **Implement Job Queue for Async Operations**
  - Integrate job queue library (Asynq or Machinery)
  - Move email notifications to background jobs
  - Move WebSocket notifications to background jobs (except real-time chat)
  - Move welcome bot messages to background jobs
  - Add retry logic with exponential backoff
  - Implement dead letter queue for failed jobs

### Deployment & Health

- [ ] **Add Health/Readiness Probes to App Service**
  - Create `/health/live` endpoint (checks if server is running)
  - Create `/health/ready` endpoint (checks DB, Redis, dependencies)
  - Update `compose.yml` with health check configuration
  - Configure appropriate timeouts and intervals

## 🟢 Medium Priority - Modern Chat Features

### Core Interaction Patterns

- [ ] **Implement Threaded Replies**
  - Add `parent_message_id` field to Message model
  - Create API endpoint: `POST /rooms/:id/messages/:messageId/replies`
  - Create API endpoint: `GET /rooms/:id/messages/:messageId/thread`
  - Display threaded UI in frontend
  - Broadcast thread updates via WebSocket

- [ ] **Add @Mention System**
  - Parse message content for `@username` patterns
  - Create notifications for mentioned users
  - Store mentions in database (many-to-many: messages ↔ users)
  - Add API endpoint: `GET /users/me/mentions`
  - Highlight mentions in message UI

- [ ] **Implement Message Reactions**
  - Create Reaction model (message_id, user_id, emoji)
  - Create API endpoint: `POST /rooms/:id/messages/:messageId/reactions`
  - Create API endpoint: `DELETE /rooms/:id/messages/:messageId/reactions/:emoji`
  - Aggregate reaction counts per message
  - Broadcast reaction updates via WebSocket

- [ ] **Add Rich Text / Markdown Support**
  - Implement markdown parsing on backend (use `goldmark`)
  - Sanitize HTML output to prevent XSS
  - Integrate DOMPurify on frontend
  - Support: bold, italic, code blocks, links, lists
  - Add markdown preview in message composer

### UX Enhancements

- [ ] **Implement Infinite Scroll for Message History**
  - Modify backend to support cursor-based pagination
  - Add `before` query parameter to `GET /rooms/:id/messages`
  - Integrate TanStack Query on frontend
  - Fetch older messages when user scrolls to top
  - Maintain scroll position after loading history

- [ ] **Add Message Edit & Soft Delete**
  - Add `deleted_at` and `edited_at` timestamps to Message model
  - Create API endpoint: `PATCH /rooms/:id/messages/:messageId` (edit)
  - Create API endpoint: `DELETE /rooms/:id/messages/:messageId` (soft delete)
  - Show "(edited)" indicator on edited messages
  - Show "(deleted)" placeholder for deleted messages
  - Maintain audit trail in database

- [ ] **Implement Read Receipts (DMs only)**
  - Create MessageReceipt model (message_id, user_id, read_at)
  - Track "Delivered" status (message sent to recipient)
  - Track "Read" status (recipient opened conversation)
  - Create API endpoint: `POST /messages/:id/read`
  - Display status indicators in UI

- [ ] **Add Unread Message Indicator**
  - Store last-read message ID per user per room
  - Calculate unread count on room list
  - Display "New Messages" divider in message list
  - Auto-scroll to first unread message when opening room

### Community Features

- [ ] **Implement Report & Block Mechanisms**
  - Create Report model (reporter_id, reported_user_id, message_id, reason)
  - Create Block model (blocker_id, blocked_id)
  - Create API endpoint: `POST /users/:id/block`
  - Create API endpoint: `POST /messages/:id/report`
  - Hide blocked users' messages from blocker's view
  - Create admin moderation dashboard

- [ ] **Add Welcome Bot**
  - Create system user account ("WelcomeBot")
  - Trigger welcome message on user's first room join
  - Include quick tutorial on features (@mentions, /commands)
  - Personalize message with user's name

- [ ] **Implement Empty State Coaching**
  - Show placeholder text in empty rooms: "Be the first to say hello!"
  - Display room guidelines/description when no messages
  - Add "Invite friends" CTA in empty private rooms

### Role-Based Access Control

- [ ] **Expand RBAC Beyond IsAdmin**
  - Create Role model (id, name, permissions)
  - Create UserRole junction table
  - Add permissions: `message.pin`, `user.mute`, `message.delete`
  - Implement role checking middleware
  - Create admin endpoints for role management

- [ ] **Add Message Pinning**
  - Add `pinned` boolean field to Message model
  - Create API endpoint: `POST /rooms/:id/messages/:messageId/pin` (admin only)
  - Display pinned messages at top of room
  - Limit to 3 pinned messages per room

- [ ] **Add User Muting (Moderation)**
  - Create Mute model (room_id, user_id, muted_until, muted_by)
  - Create API endpoint: `POST /rooms/:id/mute/:userId` (admin only)
  - Prevent muted users from sending messages
  - Show mute expiration in UI
  - Auto-unmute after expiration

## 🔵 Low Priority - Quality of Life

### Advanced Features

- [ ] **Implement Link Previews (Open Graph)**
  - Create microservice/function to scrape URLs
  - Extract Open Graph metadata (title, description, image)
  - Cache preview data in Redis (24-hour TTL)
  - Display preview cards for shared links
  - Add privacy toggle to disable link previews

- [ ] **Add System Messages**
  - Generate system messages for user joins/leaves
  - Format: "*Username joined the room*"
  - Trigger from existing presence logic
  - Style differently from user messages (grey/italics)

- [ ] **Enhance Typing Indicators**
  - Ensure robust typing indicator across all rooms
  - Add debouncing (500ms) to reduce broadcasts
  - Clear indicator after 5 seconds of inactivity
  - Show multiple users typing: "Alice and Bob are typing..."

- [ ] **Implement Feature Flags**
  - Integrate feature flag library (LaunchDarkly, Unleash, or custom)
  - Wrap new features in flag checks
  - Create admin UI for toggling features
  - Implement gradual rollouts (percentage-based)

## 🧪 Testing & Safety

- [ ] **Run Tests with Race Detector**
  - Add `-race` flag to CI test command
  - Fix any race conditions detected
  - Ensure all concurrent code is race-safe

- [ ] **Add Load Testing**
  - Create load test scenarios (k6 or Locust)
  - Test WebSocket connection limits
  - Test message throughput under load
  - Identify bottlenecks and optimize

- [ ] **Implement Circuit Breakers**
  - Add circuit breaker for database calls
  - Add circuit breaker for Redis calls
  - Add circuit breaker for external services
  - Configure thresholds and timeout behavior

---

## 📝 Implementation Notes

**For AI Agents:**

- Each checkbox represents a discrete task
- Tasks include specific endpoints, models, and technical details
- Prioritize Tier 1 (🔴) before Tier 2 (🟡)
- Review existing code patterns before implementing
- Ensure all database changes include migrations
- Add tests for each new feature
- Update OpenAPI spec with new endpoints

**Current Strengths:**

- ✅ Structured logging with slog
- ✅ Redis Pub/Sub for WebSocket scaling
- ✅ Basic rate limiting
- ✅ WebSocket hub architecture
- ✅ Integration test suite

**Immediate Next Steps:**

1. Implement Service layer refactor
2. Add database read/write separation
3. Integrate job queue for async processing
4. Add distributed tracing
5. Implement JWT refresh tokens
