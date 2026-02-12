# Sanctum Production Review - Quick Reference Checklist

Use this condensed checklist to guide your production readiness review.

## 🔐 Security (CRITICAL)

- [ ] No hardcoded secrets in code
- [ ] `.env` not in git (check history too)
- [ ] Strong JWT validation & expiration
- [ ] Rate limiting on ALL endpoints
- [ ] SQL injection prevention
- [ ] XSS protection in frontend
- [ ] CORS properly configured
- [ ] Input validation everywhere
- [ ] Admin endpoints protected
- [ ] WebSocket auth enforced
- [ ] Password complexity enforced
- [ ] Session security

## 💾 Database

- [ ] All queries have proper indexes
- [ ] Foreign key constraints in place
- [ ] Migrations are safe & reversible
- [ ] No N+1 query problems
- [ ] Transactions used correctly
- [ ] Connection pooling configured
- [ ] Read replicas consideration

## ⚠️ Error Handling

- [ ] NO ignored errors (`_ = err`)
- [ ] All errors wrapped with context
- [ ] HTTP errors return useful messages
- [ ] Panic recovery in goroutines
- [ ] Timeouts on all external calls
- [ ] Graceful degradation patterns
- [ ] Redis failure handling

## 📊 Observability

- [ ] Structured logging (JSON)
- [ ] Request IDs in all logs
- [ ] Health check endpoints
- [ ] Metrics exposed
- [ ] Error logging with stack traces
- [ ] Performance metrics

## ⚡ WebSockets

- [ ] Connection limits enforced
- [ ] Heartbeat mechanism
- [ ] Auto-reconnect on client
- [ ] Message rate limiting
- [ ] Connection cleanup on disconnect
- [ ] No goroutine leaks
- [ ] Backpressure handling

## 🚀 Performance

- [ ] Query optimization done
- [ ] Caching strategy defined
- [ ] Pagination implemented
- [ ] Connection pooling used
- [ ] No unbounded goroutines
- [ ] Memory leak prevention

## 🧪 Testing

- [ ] Critical flows tested
- [ ] Integration tests for APIs
- [ ] WebSocket tests
- [ ] Race detection enabled
- [ ] E2E tests for key paths

## 🐳 Deployment

- [ ] Multi-stage Docker builds
- [ ] Graceful shutdown implemented
- [ ] Health checks working
- [ ] Resource limits defined
- [ ] Migration strategy for prod
- [ ] Rollback procedure documented

## 🔧 Configuration

- [ ] All config via env vars
- [ ] Config validation at startup
- [ ] Fail-fast on missing config
- [ ] `.env.example` with placeholders
- [ ] Production config documented
- [ ] No weak default passwords

## 📝 Code Quality

- [ ] Consistent formatting
- [ ] Proper layer separation
- [ ] No circular dependencies
- [ ] No dead code
- [ ] TODOs tracked

## Quick File Review Priority

### Must Review (Critical Path)

1. `backend/internal/middleware/auth.go`
2. `backend/internal/server/*_handlers.go`
3. `backend/internal/server/websocket*.go`
4. `backend/internal/database/migrations/`
5. `backend/cmd/server/main.go`
6. `.env`, `.gitignore`
7. `compose.yml`, `compose.prod.yml`

### High Priority

1. `backend/internal/repository/*.go`
2. `backend/internal/service/*.go`
3. `frontend/src/api/client.ts`
4. `frontend/src/hooks/useAuth.ts`
5. `frontend/src/hooks/useChat.ts`

## Common Issues to Look For

### 🚨 CRITICAL

```go
// BAD
_ = someFunction()  // Ignored error

// BAD  
password := "hardcoded_secret"

// BAD
db.Where("id = " + userInput)  // SQL injection
```

### ⚠️ HIGH

```go
// BAD
for _, item := range items {
    go processItem(item)  // Unbounded goroutines
}

// BAD
select * from posts  // No index, full table scan

// BAD
AllowOrigins: []string{"*"}  // Too permissive CORS
```

## Output Template

```markdown
# Sanctum Production Review - [DATE]

## 🎯 Executive Summary
Risk Level: [LOW/MEDIUM/HIGH/CRITICAL]
Issues Found: [X critical, Y high, Z medium]
Recommendation: [GO / NO-GO / CONDITIONAL GO]

## 🔴 CRITICAL (Must Fix)
1. ❌ [Issue]
   - Location: file:line
   - Risk: CRITICAL
   - Fix: [specific action]

## 🟡 HIGH PRIORITY (Should Fix)
[Same format]

## 🟢 MEDIUM PRIORITY (Fix Soon)
[Same format]

## ✅ STRENGTHS
[What's already good]

## 📋 Deployment Checklist
- [ ] All critical issues resolved
- [ ] High priority issues addressed or accepted
- [ ] Monitoring configured
- [ ] Rollback plan tested

## 🔮 Future Improvements
[Nice-to-haves]
```

## Pre-Review Automated Checks

Run these before manual review:

```bash
# Backend
cd backend
golangci-lint run
go test -race ./...
go vet ./...

# Frontend  
cd frontend
bun run lint
bun run type-check
bun test

# Security
git secrets --scan-history  # Check for committed secrets
trivy image sanctum-backend:latest  # Docker security scan
```

## Review Duration Estimate

- Quick review (checklist only): 1-2 hours
- Standard review: 4-6 hours
- Deep dive review: 8-12 hours

Focus your time where risk is highest: Auth, WebSockets, Database queries.
