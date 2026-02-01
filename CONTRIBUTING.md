# Contributing to Vibeshift

Welcome! We're excited to have you contribute to Vibeshift. This guide will help you get started with development and ensure your contributions align with our code quality standards.

## 🚀 Quick Start

### Prerequisites

- **Go 1.25+** (backend)
- **Bun 1.0+** (frontend - [install here](https://bun.sh))
- **Docker & Docker Compose** (for services)
- **golangci-lint** (for linting - automatic if missing)

### Local Development Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/vibeshift.git
   cd vibeshift
   ```

2. **Install dependencies:**

   ```bash
   make install        # Frontend dependencies
   cd backend && go mod download
   ```

3. **Set up environment:**

   ```bash
   make env           # Creates config.yml from example
   ```

4. **Start development:**

   ```bash
   make dev-both      # Backend in Docker + local frontend (recommended DX)
   # or
   make dev           # Everything in Docker
   # or
   make dev-frontend  # Frontend only (port 5173)
   ```

### Git Hooks

When you clone this repo, git hooks are automatically configured. They will:

- 🎨 Format your code (Go & Biome)
- 🔍 Lint your code (golangci-lint & Biome)
- 🚫 Block commits if linting fails

**No manual setup needed** — it just works on `git commit`!

---

## 📝 Code Standards

### TypeScript & React (Frontend)

```typescript
// ✅ DO: Named exports, strict types
export function MyComponent() {
  return <div>Hello</div>
}

// ❌ DON'T: Default exports, loose typing
export default function MyComponent() {
  return <div>Hello</div>
}

// ✅ DO: Use clsx/cn for dynamic classes
import { cn } from '@/lib/utils'
const classes = cn('base-class', isActive && 'active-class')

// ❌ DON'T: Template literals for class merging
const classes = `base-class ${isActive ? 'active-class' : ''}`

// ✅ DO: Import types explicitly
import type { User } from '@/types'
export interface Props { user: User }

// ✅ DO: Stable keys in lists
{list.map(item => <Item key={item.id} {...item} />)}
```

See [copilot-instructions.md](.github/copilot-instructions.md) for full guidelines.

### Go (Backend)

```go
// ✅ DO: Idiomatic error handling
result, err := someOperation()
if err != nil {
    return fmt.Errorf("operation failed: %w", err)
}

// ❌ DON'T: Panic or ignore errors
if err != nil {
    panic(err)  // ❌ BAD
}

// ✅ DO: Use goroutines & channels
for item := range items {
    go processItem(item)
}

// ✅ DO: Guard clauses for early returns
if invalid(data) {
    return errors.New("invalid data")
}
// ... rest of logic

// ✅ DO: Comments explain WHY, not WHAT
// Exponential backoff prevents overwhelming the service
const backoffMultiplier = 2
```

See [go.instructions.md](docs/go.instructions.md) for full guidelines.

### Formatting

**Frontend:** Biome (strict)

```bash
make fmt-frontend      # Auto-format with Biome
make lint-frontend     # Check linting rules
```

**Backend:** Go fmt + golangci-lint

```bash
make fmt               # Auto-format Go
make lint              # Run 12+ linters
```

---

## ✅ Before You Commit

1. **Run local checks** (or they'll run automatically on commit):

   ```bash
   make fmt fmt-frontend     # Format both
   make lint lint-frontend   # Lint both
   ```

2. **Run tests:**

   ```bash
   make test-backend         # Backend unit tests
   make test-e2e             # End-to-end tests (requires backend running)
   ```

3. **Commit:**

   ```bash
   git commit -m "feat: add cool feature"
   ```

   The pre-commit hook will:
   - ✅ Format code
   - ✅ Lint code
   - ✅ Re-stage formatted files
   - ❌ Block commit if linting fails

---

## 🔗 Available Make Commands

### Development

```bash
make dev              # Full stack (Docker)
make dev-backend      # Backend only (Docker) + databases
make dev-frontend     # Frontend only (local)
make dev-both         # Backend Docker + Frontend local (best DX)
```

### Formatting & Linting

```bash
make fmt              # Format Go
make fmt-frontend     # Format frontend (Biome)
make lint             # Lint Go
make lint-frontend    # Lint frontend (Biome)
```

### Testing

```bash
make test-backend     # Unit tests
make test-e2e         # End-to-end tests
make seed             # Seed database with test data
```

### Database & Services

```bash
make down             # Stop all services
make clean            # Full cleanup (removes volumes)
make logs             # View all logs
```

### Dependencies

```bash
make deps-check       # Check for outdated deps
make deps-vuln        # Security vulnerability scan
make deps-audit       # Full dependency audit
```

---

## 🐛 Debugging

### Debug Frontend

```bash
make dev-frontend
# Vite dev server runs with HMR on http://localhost:5173
# Open DevTools (F12) for debugging
```

### Debug Backend

```bash
make logs-backend
# Or with filtering:
docker compose logs -f app --tail=100
```

### Database Issues

```bash
# Connect to Postgres
docker compose exec postgres psql -U postgres -d vibeshift

# Connect to Redis
docker compose exec redis redis-cli
```

---

## 📋 Commit Message Convention

We follow conventional commits for clarity:

```
feat: add user authentication
fix: resolve race condition in chat hub
docs: update installation guide
refactor: simplify payment handler
test: add test coverage for auth middleware
chore: update dependencies
```

**Format:** `<type>: <description>`

**Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `refactor` - Code refactoring
- `test` - Test additions/changes
- `chore` - Dependency/build changes
- `perf` - Performance improvements

---

## 🔄 Pull Request Process

1. **Create a feature branch:**

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** and commit with conventional messages

3. **Push and create a PR:**

   ```bash
   git push origin feat/my-feature
   ```

4. **Automated checks run** (GitHub Actions):
   - ✅ Frontend linting (Biome)
   - ✅ Backend linting (golangci-lint)
   - ✅ Go tests
   - ✅ Code format check

5. **Get review & merge when all checks pass**

---

## 🚨 Common Issues

### Pre-commit hook fails with "golangci-lint not found"

```bash
make install-linter
# Or manually:
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

### "Biome format --write" shows errors

Make sure you're in the frontend directory:

```bash
cd frontend
bun --bun biome format --write .
```

### Git hooks not running

Verify they're configured:

```bash
git config core.hooksPath
# Should output: .githooks
```

If not:

```bash
git config core.hooksPath .githooks
```

### Tests fail with database connection error

Ensure services are running:

```bash
make dev-both  # or make dev
docker compose ps  # verify postgres and redis
```

---

## 📚 Additional Resources

- [API Architecture](docs/API-ARCHITECTURE.md)
- [Advanced Setup](docs/ADVANCED_SETUP.md)
- [Go Instructions](docs/go.instructions.md)
- [Hooks Usage Examples](docs/HOOKS-USAGE-EXAMPLES.md)
- [Seeding Guide](docs/SEEDING.md)

---

## 💡 Tips for Success

1. **Use Make commands** — They abstract away Docker complexity
2. **Run checks locally first** — `make fmt` + `make lint` before committing
3. **Check logs early** — `make logs` helps debug issues quickly
4. **Ask questions** — Open an issue if something's unclear
5. **Keep commits focused** — One feature per PR for easier review

---

## 🎓 Learning Resources

- **React/TypeScript:** Check [copilot-instructions.md](.github/copilot-instructions.md)
- **Go:** Check [go.instructions.md](docs/go.instructions.md)
- **Database:** [REDIS.md](backend/REDIS.md) and [API-ARCHITECTURE.md](docs/API-ARCHITECTURE.md)
- **Testing:** [TESTING.md](backend/TESTING.md)

---

## ✨ Thank You

We appreciate your contributions. Following these guidelines keeps our codebase clean, consistent, and maintainable. Happy coding! 🚀
