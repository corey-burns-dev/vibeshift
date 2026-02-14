# Sanctum Production Review - Automated Analysis Phase

This prompt guides you through automated scanning and analysis before manual code review.

## Phase 1: Security Scanning

### 1.1 Secret Detection

```bash
# Check git history for committed secrets
git log --all --full-history -- .env
git log --all --full-history -- "*secret*"
git log --all --full-history -- "*password*"

# Search current codebase for potential secrets
grep -r "password\s*=\s*[\"']" . --include="*.go" --include="*.ts" --include="*.tsx"
grep -r "secret\s*=\s*[\"']" . --include="*.go" --include="*.ts" --include="*.tsx"  
grep -r "api_key\s*=\s*[\"']" . --include="*.go" --include="*.ts" --include="*.tsx"
grep -r "token\s*=\s*[\"']" . --include="*.go" --include="*.ts" --include="*.tsx"

# Check for hardcoded IPs and URLs
grep -r "http://\|https://" . --include="*.go" --include="*.ts" --include="*.tsx" | grep -v "localhost\|example.com\|test"
```

### 1.2 Dependency Vulnerabilities

```bash
# Go dependencies
cd backend
go list -json -m all | docker run -i sonatypecommunity/nancy:latest sleuth

# Or use govulncheck
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...

# NPM dependencies  
cd ../frontend
npm audit
# or with bun
bun audit
```

### 1.3 Docker Security

```bash
# Scan backend image
docker build -t sanctum-backend:review -f Dockerfile .
trivy image sanctum-backend:review

# Scan frontend image
docker build -t sanctum-frontend:review -f frontend/Dockerfile ./frontend
trivy image sanctum-frontend:review

# Check Dockerfile best practices
hadolint Dockerfile
hadolint frontend/Dockerfile
```

## Phase 2: Code Quality Analysis

### 2.1 Go Code Analysis

```bash
cd backend

# Linting with golangci-lint (comprehensive)
golangci-lint run --enable-all --timeout 10m

# Static analysis
go vet ./...

# Race condition detection  
go test -race ./...

# Code complexity
gocyclo -over 15 .

# Find ineffective assignments
ineffassign ./...

# Check error handling
errcheck ./...

# Specific to look for:
# - Ignored errors
grep -rn "_ = " . --include="*.go" | grep -v "_test.go" | grep -v "// nolint"

# - Unbounded goroutines
grep -rn "go func" . --include="*.go"

# - SQL queries without parameterization  
grep -rn "db.Raw\|db.Exec" . --include="*.go" | grep "\+\|Sprintf"
```

### 2.2 Frontend Code Analysis

```bash
cd frontend

# Type checking
bun run type-check

# Linting
bun run lint

# Find console.log statements (should be removed)
grep -rn "console\.log\|console\.error" src/ --include="*.ts" --include="*.tsx"

# Check for dangerous innerHTML usage
grep -rn "dangerouslySetInnerHTML\|innerHTML" src/ --include="*.tsx" --include="*.ts"

# Find TODO/FIXME comments
grep -rn "TODO\|FIXME" src/ --include="*.ts" --include="*.tsx"
```

## Phase 3: Database Analysis

### 3.1 Migration Review

```bash
cd backend/internal/database/migrations

# List all migrations in order
ls -la *.sql | sort

# Check for destructive operations
grep -i "drop\|truncate\|delete" *.sql

# Verify UP and DOWN migrations match
for f in *up.sql; do
    base=$(basename $f .up.sql)
    if [ ! -f "${base}.down.sql" ]; then
        echo "Missing down migration for $base"
    fi
done
```

### 3.2 Query Performance Analysis

```bash
# Find all database queries in code
cd backend
grep -rn "db.Where\|db.Find\|db.First\|db.Raw\|db.Exec" . --include="*.go" -A 2

# Look for potential N+1 queries
grep -rn "Preload\|Joins\|Association" . --include="*.go"

# Check for missing indexes (manual review needed)
# Focus on WHERE, ORDER BY, JOIN columns
grep -rn "WHERE\|ORDER BY\|JOIN" internal/database/migrations/ --include="*.sql"
```

## Phase 4: Configuration & Secrets

### 4.1 Environment Variables

```bash
# Check .env is in .gitignore
grep "^\.env$" .gitignore

# Verify .env.example exists
test -f .env.example && echo "✓ .env.example exists" || echo "✗ Missing .env.example"

# Compare .env and .env.example keys
if [ -f .env ] && [ -f .env.example ]; then
    echo "Keys in .env but not in .env.example:"
    comm -23 <(grep "^[A-Z]" .env | cut -d= -f1 | sort) <(grep "^[A-Z]" .env.example | cut -d= -f1 | sort)
fi

# Check for weak passwords
grep -i "password.*=.*password\|password.*=.*123\|password.*=.*admin" .env .env.example config*.yml
```

### 4.2 CORS Configuration

```bash
# Find CORS settings
cd backend
grep -rn "AllowOrigins\|CORS" . --include="*.go" -B 2 -A 2

# Check if it's too permissive
grep -rn "AllowOrigins.*\*" . --include="*.go"
```

## Phase 5: Performance & Resource Analysis

### 5.1 Goroutine & Memory Leaks

```bash
cd backend

# Find unbounded goroutine creation
grep -rn "go func\|go (" . --include="*.go" -B 3 -A 5 | grep -v "defer\|context\|cancel"

# Check for proper context usage in goroutines  
grep -rn "go func" . --include="*.go" -A 10 | grep -c "context"

# Look for potential memory leaks
grep -rn "make.*\[\].*,\s*0\s*,\s*[0-9]\{4,\}" . --include="*.go"  # Large pre-allocations
```

### 5.2 WebSocket Resource Management

```bash
cd backend

# Check WebSocket connection management
grep -rn "websocket\|hub\|Hub" . --include="*.go" -A 5 | grep -i "close\|cleanup\|disconnect"

# Verify connection limits
grep -rn "MaxConnections\|ConnectionLimit\|max.*conn" . --include="*.go"

# Check heartbeat/ping implementation  
grep -rn "ping\|pong\|heartbeat" . --include="*.go" -i
```

## Phase 6: Testing Coverage

### 6.1 Go Test Coverage

```bash
cd backend

# Generate coverage report
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html

# Show coverage by package
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out | sort -k3 -n

# Critical paths to check (should be >70%)
go test ./internal/server/... -cover
go test ./internal/middleware/... -cover  
go test ./internal/repository/... -cover
```

### 6.2 Frontend Test Coverage

```bash
cd frontend

# Run tests with coverage
bun test --coverage

# Check critical hook coverage
bun test src/hooks/ --coverage
```

## Phase 7: Documentation Review

```bash
# Check for README in key directories
find . -type d -name "internal" -o -name "src" | while read dir; do
    if [ ! -f "$dir/README.md" ]; then
        echo "Missing README in $dir"
    fi
done

# Verify API documentation exists
test -f backend/docs/swagger.json && echo "✓ API docs exist" || echo "✗ Missing API docs"

# Check for runbook documentation
test -f docs/operations/runbooks/rollback-runbook.md && echo "✓ Rollback runbook exists"
test -f docs/operations/runbooks/ci-runbook.md && echo "✓ CI runbook exists"
```

## Phase 8: Build & Deploy Verification

### 8.1 Build Process

```bash
# Backend build
cd backend
go build -o /tmp/sanctum-test ./cmd/server/
test $? -eq 0 && echo "✓ Backend builds successfully" || echo "✗ Backend build failed"

# Frontend build
cd frontend
bun run build
test $? -eq 0 && echo "✓ Frontend builds successfully" || echo "✗ Frontend build failed"

# Docker builds
docker-compose build
test $? -eq 0 && echo "✓ Docker images build successfully" || echo "✗ Docker build failed"
```

### 8.2 Health Checks

```bash
# Start services
docker-compose up -d

# Wait for startup
sleep 10

# Test health endpoints
curl -f http://localhost:8375/health || echo "✗ Backend health check failed"
curl -f http://localhost:8375/ping || echo "✗ Backend ping failed"
curl -f http://localhost:5173 || echo "✗ Frontend not accessible"

# Check database connectivity
docker-compose exec backend go run cmd/debug_schema/main.go 2>&1 | grep -q "Connected" && echo "✓ DB connection works"

# Cleanup
docker-compose down
```

## Automated Report Generation

### Create Summary Report

```bash
cat > automated-review-results.md << 'EOF'
# Automated Security & Quality Scan Results

## Security Scan
- [ ] No secrets in git history
- [ ] No hardcoded credentials
- [ ] No critical dependency vulnerabilities
- [ ] Docker images pass security scan

## Code Quality  
- [ ] Go code passes linting
- [ ] Frontend code passes linting
- [ ] No ignored errors found
- [ ] No race conditions detected

## Database
- [ ] All migrations have rollback
- [ ] No destructive migrations without safeguards

## Configuration
- [ ] .env not in git
- [ ] .env.example exists
- [ ] No weak default passwords
- [ ] CORS not overly permissive

## Performance
- [ ] No unbounded goroutine creation
- [ ] WebSocket connections properly managed
- [ ] Context used in goroutines

## Testing
- [ ] Backend test coverage >60%
- [ ] Frontend test coverage >60%
- [ ] Critical paths tested

## Build & Deploy
- [ ] Backend builds without errors
- [ ] Frontend builds without errors  
- [ ] Docker images build successfully
- [ ] Health checks pass

## Issues Found
[List all issues discovered by automated scans]

## Next Steps
[Recommendations for manual review]
EOF
```

## Critical Patterns to Search For

### Red Flags (Auto-search)

```bash
# Search for all critical patterns at once
cd backend

echo "=== Searching for critical issues ==="

echo "Ignored errors:"
grep -rn "_ = " . --include="*.go" | grep -v "_test.go" | grep -v "// nolint" | wc -l

echo "Potential SQL injection:"
grep -rn 'fmt.Sprintf.*["].*%.*["]' . --include="*.go" | grep -i "select\|insert\|update\|delete" | wc -l

echo "Hardcoded secrets:"  
grep -rn "password.*=.*[\"'][a-zA-Z0-9]\+" . --include="*.go" --include="*.yaml" --include="*.yml" | wc -l

echo "Unbounded goroutines:"
grep -rn "for.*range" . --include="*.go" -A 2 | grep "go func\|go (" | wc -l

echo "Missing auth checks:"
grep -rn "func.*Handler" . --include="*.go" | wc -l
grep -rn "func.*Handler" . --include="*.go" -A 10 | grep "GetUserID\|RequireAuth\|CheckAuth" | wc -l
```

## Automation Script

Save this as `run-automated-review.sh`:

```bash
#!/bin/bash
set -e

echo "🔍 Starting Automated Production Review"
echo "========================================"

# Security
echo "1/8 Running security scans..."
# Add actual commands here

# Code Quality  
echo "2/8 Analyzing code quality..."

# Database
echo "3/8 Reviewing database..."

# Configuration
echo "4/8 Checking configuration..."

# Performance
echo "5/8 Performance analysis..."

# Testing
echo "6/8 Test coverage..."

# Documentation
echo "7/8 Documentation check..."

# Build
echo "8/8 Build verification..."

echo "✅ Automated review complete!"
echo "Review the results in automated-review-results.md"
```

Run with: `chmod +x run-automated-review.sh && ./run-automated-review.sh`

## Post-Automation: Manual Review Focus

After automation, focus manual review on:

1. **Business Logic Correctness** - Does it do what it's supposed to do?
2. **Authorization Logic** - Are permissions checked correctly?
3. **Edge Cases** - What happens with unexpected input?
4. **Error Messages** - Are they helpful but not revealing?
5. **Race Conditions** - Concurrent access scenarios
6. **WebSocket Message Flow** - Correctness of real-time features
7. **Database Transaction Boundaries** - Are they appropriate?
8. **Cache Invalidation** - Is it correct and complete?

Remember: Automated tools catch syntax and patterns.
You must catch logic errors and security assumptions.
