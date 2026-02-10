# Project Implementation Checklist (Merged & Updated)

## 🔴 Critical - Tier 1: Production Readiness

### CI/CD & Repo Hygiene

- [ ] **Fix and Harden CI Pipeline**
  - Pin GitHub Actions to stable versions (checkout, setup-go, buildx)
  - Ensure `go test ./...` runs on every PR
  - Add nightly `go test -race ./...` job
  - Fail CI on linting, formatting, or test errors
  - Optionally add OpenAPI drift check (generate + diff)

### Health & Availability

- [ ] **Split Health Endpoints Correctly**
  - `/health/live` → process is up
  - `/health/ready` → DB, Redis, dependencies
  - Ensure JSON status reflects failures correctly
  - Wire readiness into Docker Compose / orchestration

### Authentication & Security

- [ ] **JWT Refresh & Session Strategy**
  - Reduce access token lifetime to ~15 minutes
  - Implement refresh tokens (Redis, 30-day TTL)
  - Implement refresh token rotation
  - Add logout + logout-all (revocation)

- [ ] **Decide and Enforce Auth Storage Model**
  - Decide: bearer tokens (memory/localStorage) vs httpOnly cookies
  - If cookies are used → add CSRF protection
  - Document the decision and threat model

- [ ] **Harden Security Headers**
  - Add Content-Security-Policy (CSP)
  - Tighten Helmet / Fiber security config
  - Disable dev dashboards in production

### Database & Data Safety

- [ ] **Replace AutoMigrate with Controlled Migrations**
  - Remove AutoMigrate from production paths
  - Introduce migration tool (goose or golang-migrate)
  - Convert manual schema fixes into real migrations
  - Ensure rollback support

- [ ] **Mandatory Database Indexing Pass**
  - Posts: `(user_id, created_at)`
  - Comments: `(post_id, created_at)`
  - Likes: unique `(post_id, user_id)`
  - Messages: `(conversation_id, created_at)`
  - Friendships: unique user pair constraint

### WebSockets & Abuse Controls

- [ ] **WebSocket Guardrails**
  - Enforce per-user connection limits
  - Heartbeat ping/pong + cleanup
  - Redis-backed connection tracking
  - Rate-limit abusive message types

---

## 🟡 High Priority - Tier 2: Scale-Ready Architecture

### Code Architecture

- [ ] **Introduce Service Layer**
  - Handler → Service → Repository
  - Move orchestration and business rules to services
  - Keep handlers I/O-only

### Observability

- [ ] **Prometheus Metrics (Real, Not UI)**
  - Replace Fiber monitor with `/metrics` endpoint
  - Track DB latency, Redis errors, WS connections
  - Optional: keep monitor UI for non-prod

- [ ] **Distributed Tracing**
  - OpenTelemetry integration
  - Trace API → Service → DB/Redis
  - Add sampling config for prod

### Runtime Config Safety

- [ ] **Fail-Fast Configuration Validation**
  - Validate required env vars on boot
  - Validate CORS origins, cookie flags, SSL modes
  - Crash early on invalid config

### Background Processing

- [ ] **Async Job Queue**
  - Introduce Asynq or equivalent
  - Move notifications, bots, non-critical work
  - Retries + dead letter queue

---

## 🟢 Medium Priority - Product & UX Features

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

---

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

## ✅ Summary of What Was Added

- CI trustworthiness (pinning, race tests)
- Auth storage + CSRF/CSP decisions
- Correct health probe semantics
- Mandatory DB indexing (high ROI)
- Real Prometheus metrics vs dev UI
- Fail-fast runtime config validation
- WebSocket abuse guardrails

This version is **production-correct**, not just feature-complete.
