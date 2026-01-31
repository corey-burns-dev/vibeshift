# 🐳 AI Agent Docker-First Guidelines (CRITICAL)

**ADD THIS SECTION TO YOUR AI_RULES.md**

This section addresses the most common issue AI agents encounter: trying to run Go commands directly.

---

## ⚠️ CRITICAL: Go Commands in Claude.ai

### The Problem

**Go is NOT installed** in the Claude.ai computer environment. Running Go commands directly will cause the AI agent to **hang indefinitely**.

```bash
# ❌ THESE WILL HANG FOREVER - NEVER USE:
go build ./...
go test ./...
go run main.go
go fmt ./...
go mod tidy
cd backend && go test  # Still hangs!
```

### Why This Happens

VibeShift uses a **Docker-first architecture** where:

- Host system: No Go installed (by design)
- Docker containers: Go 1.25 pre-installed
- All Go commands must run **inside containers**

This is **intentional** and follows best practices for:

- Consistent development environments
- Production parity
- No "works on my machine" issues

---

## ✅ Correct Patterns for AI Agents

### Pattern 1: Use Makefile Targets (PREFERRED)

The Makefile wraps all Docker commands safely:

```bash
# Format Go code
make fmt

# Run tests
make test

# Seed database
make seed

# Build containers
make build

# Start development environment
make dev
make dev-backend

# Update dependencies
make deps-update
make deps-tidy

# Check for vulnerabilities
make deps-vuln

# Lint code
make lint
```

**Why Preferred:**

- Handles Docker orchestration automatically
- Consistent across all environments
- Self-documenting (`make help`)
- Safe for AI agents to use

---

### Pattern 2: Docker Compose Exec (Services Running)

If backend services are already running (`make dev-backend` was run):

```bash
# Format code
docker compose exec app go fmt ./...

# Run tests
docker compose exec app go test ./...

# Run specific test
docker compose exec app go test -v ./repository

# Add dependency
docker compose exec app go get github.com/some/package
docker compose exec app go mod tidy

# Build binary
docker compose exec app go build -o main .

# Run custom command
docker compose exec app go run cmd/seed/main.go
```

**When to Use:**

- Development session is active
- Need interactive commands
- Want faster execution (container already warm)

---

### Pattern 3: Docker Compose Run (One-Off Commands)

For commands without running services:

```bash
# Run tests without starting full stack
docker compose run --rm app go test -v ./...

# Check Go version
docker compose run --rm app go version

# Add dependency and tidy
docker compose run --rm app sh -c "go get github.com/pkg && go mod tidy"

# Format and test in one command
docker compose run --rm app sh -c "go fmt ./... && go test ./..."
```

**When to Use:**

- Services not running
- One-off tasks
- CI/CD pipelines
- Quick validation

---

## 🎯 Common Tasks - Quick Reference

### Task: Format Go Code

```bash
# ✅ CORRECT
make fmt

# ✅ ALSO CORRECT (if services running)
docker compose exec app go fmt ./...

# ✅ ALSO CORRECT (one-off)
docker compose run --rm app go fmt ./...

# ❌ WRONG - WILL HANG
go fmt ./...
cd backend && go fmt ./...
```

---

### Task: Run Tests

```bash
# ✅ CORRECT
make test

# ✅ ALSO CORRECT (specific package)
docker compose run --rm app go test -v ./repository

# ✅ ALSO CORRECT (with coverage)
docker compose run --rm app go test -cover ./...

# ❌ WRONG - WILL HANG
go test ./...
cd backend && go test
```

---

### Task: Add Go Dependency

```bash
# ✅ CORRECT (if services running)
docker compose exec app go get github.com/some/package
docker compose exec app go mod tidy

# ✅ ALSO CORRECT (one-off)
docker compose run --rm app sh -c "go get github.com/some/package && go mod tidy"

# Then rebuild container to persist
make recreate-backend

# ❌ WRONG - WILL HANG
go get github.com/some/package
go mod tidy
```

---

### Task: Update Go Dependencies

```bash
# ✅ CORRECT
make deps-update-backend

# ✅ ALSO CORRECT (manual)
docker compose run --rm app go get -u ./...
docker compose run --rm app go mod tidy

# Then rebuild
make recreate-backend

# ❌ WRONG - WILL HANG
go get -u ./...
go mod tidy
```

---

### Task: Run Database Seeder

```bash
# ✅ CORRECT
make seed

# ✅ ALSO CORRECT (manual)
docker compose run --rm app go run cmd/seed/main.go

# ❌ WRONG - WILL HANG
go run cmd/seed/main.go
cd backend && go run cmd/seed/main.go
```

---

### Task: Generate Swagger Docs

```bash
# ✅ CORRECT
make swagger

# ✅ ALSO CORRECT (manual)
docker compose exec app /root/go/bin/swag init -g main.go --output ./docs

# ❌ WRONG - WILL HANG
swag init -g main.go
cd backend && swag init
```

---

### Task: Build Production Binary

```bash
# ✅ CORRECT
make build

# ✅ ALSO CORRECT (manual)
docker compose run --rm app go build -o main .

# ❌ WRONG - WILL HANG
go build -o main .
cd backend && go build
```

---

### Task: Check Go Version

```bash
# ✅ CORRECT
docker compose run --rm app go version

# ❌ WRONG - WILL HANG
go version
```

---

## 🤖 AI Agent Decision Tree

```
┌─────────────────────────────────┐
│ AI needs to run a Go command    │
└─────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Is there a Makefile target?     │
│ (make fmt, make test, etc.)     │
└─────────────────────────────────┘
         YES │       │ NO
             ▼       ▼
        Use Makefile │
             │       │
             │       ▼
             │  ┌────────────────────────────────┐
             │  │ Are backend services running?  │
             │  │ (make dev-backend was run)     │
             │  └────────────────────────────────┘
             │       YES │       │ NO
             │           ▼       ▼
             │  docker compose   docker compose
             │  exec app go...   run --rm app go...
             │
             ▼
        ┌─────────────────────────────────┐
        │ Command executes successfully   │
        └─────────────────────────────────┘
```

---

## 🚨 Detection & Prevention

### How AI Agents Can Detect Wrong Patterns

Before running a command, check:

```bash
# ❌ RED FLAG: Command starts with 'go' directly
if [[ $command == "go "* ]]; then
    echo "ERROR: Direct Go command detected"
    echo "Use 'make <target>' or 'docker compose exec/run' instead"
    exit 1
fi

# ❌ RED FLAG: cd into backend then run go
if [[ $command == *"cd backend && go"* ]]; then
    echo "ERROR: Direct Go command detected"
    exit 1
fi
```

### Self-Correction Pattern

```python
# AI agent pseudo-code
def run_go_command(command):
    # Check if direct Go command
    if command.startswith("go "):
        # Self-correct
        safe_command = f"docker compose run --rm app {command}"
        print(f"⚠️ Correcting to safe pattern: {safe_command}")
        return run(safe_command)
    
    return run(command)
```

---

## 📋 Complete Command Translation Table

| Direct Command (❌ WRONG) | Correct Alternative (✅) |
|---------------------------|-------------------------|
| `go version` | `docker compose run --rm app go version` |
| `go build` | `make build` |
| `go test` | `make test` |
| `go fmt ./...` | `make fmt` |
| `go run main.go` | `docker compose run --rm app go run main.go` |
| `go get pkg` | `docker compose exec app go get pkg` |
| `go mod tidy` | `docker compose exec app go mod tidy` |
| `go install tool` | `docker compose exec app go install tool` |
| `go generate` | `docker compose run --rm app go generate ./...` |
| `go vet` | `docker compose run --rm app go vet ./...` |
| `go doc pkg` | `docker compose run --rm app go doc pkg` |
| `go list -m all` | `docker compose run --rm app go list -m all` |

---

## 🎓 Understanding the Environment

### What IS Available in Claude.ai

```bash
✅ bash, sh, zsh
✅ docker
✅ docker compose
✅ make
✅ git
✅ curl, wget
✅ sed, awk, grep
✅ python3
✅ node (via Docker)
```

### What is NOT Available (Must Use Docker)

```bash
❌ go
❌ bun (use in frontend Docker)
❌ postgres client (use Docker)
❌ redis-cli (use Docker)
```

---

## 🔄 Workflow Examples

### Example 1: Create New Repository File

**AI Task:** Create a new repository file and test it

```bash
# Step 1: AI creates the file (direct file creation - OK)
cat > backend/repository/notification.go << 'EOF'
package repository
// ... code here ...
EOF

# Step 2: Format the code (use Docker)
make fmt
# OR
docker compose run --rm app go fmt ./repository

# Step 3: Run tests (use Docker)
make test
# OR
docker compose run --rm app go test -v ./repository

# ✅ CORRECT - No direct Go commands used
```

---

### Example 2: Add New Dependency

**AI Task:** Add `github.com/pkg/errors` package

```bash
# Step 1: Add to imports in code (direct file edit - OK)
# AI edits the Go file directly

# Step 2: Get dependency (use Docker)
docker compose run --rm app sh -c "go get github.com/pkg/errors && go mod tidy"

# Step 3: Rebuild container to persist
make recreate-backend

# ✅ CORRECT - All Go commands in Docker
```

---

### Example 3: Debug Failing Test

**AI Task:** Run specific test with verbose output

```bash
# ❌ WRONG
cd backend && go test -v ./repository/user_test.go

# ✅ CORRECT
docker compose run --rm app go test -v ./repository -run TestCreateUser

# ✅ ALSO CORRECT (with more details)
docker compose run --rm app go test -v -race -cover ./repository -run TestCreateUser
```

---

## 🛡️ Safety Checks for AI Agents

### Pre-Flight Check Function

```bash
#!/bin/bash
# Add this to AI agent's command validator

check_go_command() {
    local cmd="$1"
    
    # Check for direct Go commands
    if [[ "$cmd" =~ ^go\ |\ go\ |&&\ go\ |\|\ go\  ]]; then
        echo "❌ ERROR: Direct Go command detected: $cmd"
        echo "📚 Please use one of these patterns instead:"
        echo "   1. make <target>    (preferred)"
        echo "   2. docker compose exec app go ..."
        echo "   3. docker compose run --rm app go ..."
        echo ""
        echo "See AI_RULES.md section: AI Agent Docker-First Guidelines"
        return 1
    fi
    
    return 0
}

# Usage
if ! check_go_command "$user_command"; then
    exit 1
fi
```

---

## ✅ Summary for AI Agents

**Golden Rules:**

1. **NEVER** run Go commands directly (`go test`, `go build`, etc.)
2. **ALWAYS** check for Makefile targets first (`make test`, `make build`)
3. **USE** `docker compose exec/run` for commands not in Makefile
4. **REMEMBER** Go is intentionally not installed on host system
5. **UNDERSTAND** This is correct architecture, not a limitation

**Quick Test:**

```bash
# If this works, you're doing it right:
make test

# If this hangs, you're doing it wrong:
go test
```

---

**Last Updated:** 2026-01-31  
**Critical for:** All AI agents working with VibeShift  
**Impact:** Prevents 100% of Go command hanging issues
