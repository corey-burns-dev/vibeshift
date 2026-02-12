# Sanctum Production Readiness Review - Comprehensive Agent Prompt

## Mission

You are an experienced senior engineer conducting a comprehensive pre-production audit of Sanctum, a full-stack social media platform. Your goal is to identify ALL issues that could cause failures, security breaches, performance problems, or operational difficulties in production.

## Context

- **Application**: Sanctum - Reddit-style social platform for hobbies and interests
- **Stack**: Go (Fiber) backend, React 19 frontend, PostgreSQL, Redis
- **Features**: Posts/comments, real-time chat (WebSockets), multiplayer games, friend system, Sanctums (communities)
- **Note**: Video streaming and WebRTC video chat have been moved to the `with-streaming-video` branch.
- **Deployment Target**: Production environment with real users
- **Current State**: Development-complete, needs production hardening

## Your Review Objectives

### 1. SECURITY AUDIT (Critical Priority)

Examine every aspect for security vulnerabilities:

- [ ] Authentication & Authorization mechanisms
- [ ] JWT token handling (generation, validation, expiration, refresh)
- [ ] Session management and security
- [ ] Password storage and validation
- [ ] API endpoint protection (who can access what)
- [ ] SQL injection prevention
- [ ] XSS prevention in frontend
- [ ] CSRF protection
- [ ] Rate limiting on all endpoints (auth, posts, comments, chat)
- [ ] Input validation and sanitization (both backend and frontend)
- [ ] File upload security (if applicable)
- [ ] WebSocket connection security and rate limiting
- [ ] CORS configuration for production domains
- [ ] Secrets management (env vars, API keys, database credentials)
- [ ] Headers security (CSP, HSTS, X-Frame-Options, etc.)
- [ ] Dependency vulnerabilities (Go modules, npm packages)
- [ ] Admin role protection and audit trails

### 2. DATABASE & DATA INTEGRITY

Review database design and query patterns:

- [ ] Database schema review for:
  - Foreign key constraints
  - Unique constraints
  - Check constraints
  - Nullable vs NOT NULL columns
  - Index coverage for all queries
- [ ] Migration system:
  - Migration files properly ordered
  - No destructive migrations
  - Rollback capability
  - Data migration safety
- [ ] Query performance:
  - N+1 query problems
  - Missing indexes on hot paths (feeds, chats, lookups)
  - Query optimization for pagination
  - Proper use of database transactions
- [ ] Data consistency:
  - Race conditions in concurrent operations
  - Referential integrity enforcement
  - Orphaned record prevention
  - Proper use of database constraints

### 3. ERROR HANDLING & RESILIENCE

Check every code path for proper error handling:

- [ ] ALL errors are properly handled (no `_ = err` unless explicitly justified)
- [ ] Errors are wrapped with context using `fmt.Errorf("%w")`
- [ ] HTTP error responses include meaningful messages
- [ ] Frontend displays user-friendly error messages
- [ ] Graceful degradation when services are unavailable
- [ ] Redis failure handling (app should work without cache)
- [ ] Database connection pool exhaustion handling
- [ ] WebSocket reconnection logic
- [ ] Timeout configurations on all external calls
- [ ] Circuit breaker patterns for external dependencies
- [ ] Panic recovery in goroutines and HTTP handlers

### 4. LOGGING & OBSERVABILITY

Ensure you can debug production issues:

- [ ] Structured logging (JSON format preferred)
- [ ] Consistent log levels (DEBUG, INFO, WARN, ERROR)
- [ ] Request ID/Trace ID propagation
- [ ] User ID in logs (where applicable)
- [ ] Performance metrics logging (latency, throughput)
- [ ] WebSocket connection lifecycle logging
- [ ] Database query logging (for slow queries)
- [ ] Error stack traces captured
- [ ] Log aggregation strategy documented
- [ ] Metrics exposure (Prometheus or similar)
- [ ] Health check endpoints (/health, /ready)
- [ ] Distributed tracing readiness

### 5. CONFIGURATION & ENVIRONMENT

Review environment configuration management:

- [ ] All configuration via environment variables
- [ ] No hardcoded secrets in code
- [ ] Config validation at startup
- [ ] Fail-fast on missing required config
- [ ] Separate configs for dev/staging/prod
- [ ] `.env` NOT committed to git (check `.gitignore`)
- [ ] `.env.example` with placeholder values exists
- [ ] Strong password requirements documented
- [ ] Production-specific config documented
- [ ] Database connection string security
- [ ] Redis connection security

### 6. WEBSOCKET & REAL-TIME FEATURES

Audit WebSocket implementation for scale:

- [ ] Connection limits per user
- [ ] Heartbeat/ping-pong mechanism
- [ ] Automatic reconnection on client
- [ ] Connection cleanup on disconnect
- [ ] Message rate limiting
- [ ] Backpressure handling
- [ ] Broadcast efficiency (avoid N broadcast calls)
- [ ] Memory leaks in connection maps
- [ ] Goroutine leaks in WebSocket handlers
- [ ] Proper use of contexts for cancellation
- [ ] Redis pub/sub for multi-instance scaling

### 7. PERFORMANCE & SCALABILITY

Identify performance bottlenecks:

- [ ] Database query optimization
- [ ] Proper indexing strategy
- [ ] Redis caching strategy:
  - What is cached
  - Cache TTLs defined
  - Cache invalidation logic
  - Cache miss handling
- [ ] Pagination implementation (posts, comments, messages)
- [ ] Batch operations where applicable
- [ ] Goroutine management (no unbounded goroutine creation)
- [ ] Memory management (potential memory leaks)
- [ ] Connection pooling (database, Redis)
- [ ] Static asset optimization (frontend)
- [ ] API response payload sizes
- [ ] Lazy loading vs eager loading decisions

### 8. TESTING & QUALITY

Review test coverage and quality:

- [ ] Critical user flows have tests:
  - User registration/login
  - Post creation and viewing
  - Chat message sending
  - Friend requests
  - Sanctum membership
- [ ] Integration tests for API endpoints
- [ ] Unit tests for business logic
- [ ] WebSocket functionality tests
- [ ] Database migration tests
- [ ] Frontend component tests
- [ ] E2E tests for critical paths
- [ ] Load testing performed
- [ ] Race condition testing (`go test -race`)
- [ ] Error case testing

### 9. DEPLOYMENT & OPERATIONS

Check production deployment readiness:

- [ ] Docker images optimized:
  - Multi-stage builds used
  - Minimal base images
  - No unnecessary layers
  - Security scanning
- [ ] Health check endpoints work correctly
- [ ] Graceful shutdown implemented
- [ ] Zero-downtime deployment possible
- [ ] Database migration strategy for production
- [ ] Rollback procedures documented
- [ ] Resource limits defined (CPU, memory)
- [ ] Horizontal scaling considerations
- [ ] Database backup strategy
- [ ] Disaster recovery plan exists
- [ ] Monitoring and alerting setup

### 10. CODE QUALITY & MAINTAINABILITY

Review code organization and standards:

- [ ] Consistent code style (Go: gofmt, Frontend: Biome)
- [ ] No TODO/FIXME comments without tracking
- [ ] Proper separation of concerns:
  - Handlers → HTTP/WebSocket I/O only
  - Services → Business logic
  - Repositories → Data access only
- [ ] DRY principles followed
- [ ] Clear function/method responsibilities
- [ ] Appropriate use of interfaces
- [ ] No circular dependencies
- [ ] Package organization makes sense
- [ ] Comments where code is complex
- [ ] No dead code or unused imports

### 11. SPECIFIC FEATURES AUDIT

#### Authentication System

- [ ] Password requirements enforced
- [ ] Token expiration and refresh
- [ ] Session management
- [ ] Logout invalidates tokens
- [ ] Concurrent session handling

#### Chat System  

- [ ] Message delivery guarantees
- [ ] Message ordering
- [ ] Conversation history loading
- [ ] Typing indicators (if implemented)
- [ ] Read receipts (if implemented)
- [ ] File/image sharing security

#### Friend System

- [ ] Friend request workflow
- [ ] Block/unblock functionality
- [ ] Privacy controls
- [ ] Mutual friend queries optimized

#### Posts & Comments

- [ ] Permission checks (who can post where)
- [ ] Moderation capabilities
- [ ] Like/unlike functionality
- [ ] Comment threading
- [ ] Edit/delete with proper authorization

#### Sanctums (Communities)

- [ ] Membership management
- [ ] Admin/moderator roles
- [ ] Join request approval workflow
- [ ] Public vs private sanctums
- [ ] Leave/kick functionality

## Output Format

Structure your review as a detailed report with:

### Executive Summary

- Overall risk assessment (LOW/MEDIUM/HIGH/CRITICAL)
- Total issues found by severity
- Recommendation: GO/NO-GO for production

### Critical Issues (Must Fix Before Deploy)

List issues that will cause:

- Security breaches
- Data loss or corruption
- Complete system failures
- Major functionality breaking

For each critical issue:

```
❌ [CATEGORY] Issue Title
Location: file.go:123
Risk: HIGH/CRITICAL
Description: What's wrong
Impact: What will happen in production
Fix: Specific code changes or actions needed
```

### High Priority Issues (Should Fix Before Deploy)

Problems that will cause:

- Performance degradation
- Poor user experience
- Operational difficulties
- Partial functionality issues

### Medium Priority Issues (Fix Soon After Deploy)

Issues that:

- Reduce code quality
- Create technical debt
- Could become problems later
- Need monitoring in production

### Low Priority Issues (Nice to Have)

- Code quality improvements
- Better practices
- Optimization opportunities

### Recommendations

- Deployment readiness checklist
- Post-deployment monitoring focus areas
- Future improvements to consider
- Technical debt to address

## Review Approach

1. **Start with Security**: This is non-negotiable
2. **Check Critical Paths**: Auth, posts, chat, payments (if any)
3. **Review Error Scenarios**: What happens when things fail?
4. **Examine Resource Management**: Connections, goroutines, memory
5. **Validate Configuration**: Especially secrets and environment-specific settings
6. **Test Scalability**: Look for bottlenecks and N+1 problems
7. **Verify Testing**: Are critical flows actually tested?
8. **Check Operations**: Can you deploy, monitor, and rollback?

## Key Files to Review

### Backend (Go)

- `backend/cmd/server/main.go` - Application entry point
- `backend/internal/server/server.go` - Server setup and configuration
- `backend/internal/server/*_handlers.go` - All HTTP handlers
- `backend/internal/server/websocket*.go` - WebSocket implementations
- `backend/internal/middleware/` - Auth, logging, rate limiting
- `backend/internal/repository/` - Database access layer
- `backend/internal/service/` - Business logic
- `backend/internal/models/` - Data models
- `backend/internal/database/migrations/` - Database schema
- `backend/internal/config/config.go` - Configuration management
- `backend/internal/cache/` - Redis usage

### Frontend (React/TypeScript)

- `frontend/src/api/client.ts` - API client and error handling
- `frontend/src/hooks/` - All custom hooks (useAuth, useChat, etc.)
- `frontend/src/components/` - Component implementations
- `frontend/src/pages/` - Page-level components and routing

### Infrastructure

- `compose.yml`, `compose.prod.yml` - Docker Compose setup
- `Dockerfile`, `frontend/Dockerfile` - Container builds
- `.env.example` - Environment configuration template
- `backend/config.production.example.yml` - Production config

### Documentation

- `docs/production_ready_at_scale_checklist.md` - Production checklist
- `docs/reports/2026-01-31-deployment-readiness.md` - Previous audit

## Success Criteria

Your review is complete when you can confidently answer:

1. Can this application handle 1000+ concurrent users?
2. Is user data secure from unauthorized access?
3. Will errors be caught and logged properly?
4. Can we deploy without downtime?
5. Can we debug production issues quickly?
6. Will the system recover from Redis/database failures?
7. Are WebSocket connections properly managed at scale?
8. Is the codebase maintainable for future developers?

## Warning Signs to Look For

🚨 **Red Flags**:

- `_ = err` anywhere (ignored errors)
- Hardcoded credentials or secrets
- Missing input validation
- No rate limiting
- Weak passwords in config files
- Missing database indexes on queries
- Unbounded goroutine creation
- Missing error handling in goroutines
- No WebSocket connection limits
- SQL strings without parameterization
- No CORS configuration
- Missing authentication checks
- Circular dependencies
- Global mutable state
- Race conditions in concurrent code

---

## Final Instructions

**Be thorough but practical.**

- Focus on issues that will actually impact production
- Provide actionable fixes, not just criticisms
- Consider the scale (hundreds of users vs millions)
- Prioritize by risk and impact
- Include code examples for fixes
- Reference specific line numbers when possible

**Your review should enable the team to:**

1. Fix critical issues immediately
2. Prioritize remaining work
3. Deploy with confidence
4. Monitor the right metrics
5. Plan future improvements

Begin your comprehensive review now. Leave no stone unturned.
