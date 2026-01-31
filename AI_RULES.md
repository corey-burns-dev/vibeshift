# 🧠 VibeShift: AI Coding Standards & Context

> **Project Name:** VibeShift  
> **Purpose:** AI Context & Style Guide for maintaining code quality, consistency, and architectural integrity  
> **Last Updated:** 2026-01-31

---

## 1. 🛠️ Tech Stack Boundaries

| Category | Technology | Notes |
| :--- | :--- | :--- |
| **Frontend Runtime** | **Bun** | Use `bun install`, `bun run` |
| **Frontend Framework** | **React v19 + Vite** | TypeScript strict mode |
| **Backend Language** | **Go 1.25** | Framework: **Fiber v2** |
| **Styling** | **Tailwind CSS v4** | + `tailwindcss-animate` |
| **Linting** | **Biome** | 🚫 **No** ESLint or Prettier |
| **State (Server)** | **TanStack Query v5** | For all API data fetching |
| **State (Client)** | **Zustand** | For global UI state |
| **Routing** | **React Router v7** | SPA routing |
| **Forms** | **React Hook Form + Zod** | Client-side validation |
| **Database** | **PostgreSQL 16** | Via **GORM v1.31+** |
| **Cache** | **Redis 7.2** | WebSocket presence, rate limiting |
| **Real-time** | **WebSocket** | Via Fiber WebSocket adapter |
| **UI Components** | **Radix UI** | Shadcn/ui pattern |
| **Icons** | **Lucide React** | Tree-shakeable icons |
| **Testing (Go)** | **testify** | Table-driven tests |
| **Testing (React)** | **Vitest + RTL** | React Testing Library |

---

## 2. 📁 Project Structure (Actual)

```
vibeshift/
├── backend/
│   ├── cache/              # Redis client & helpers
│   ├── cmd/seed/           # Database seeding utility
│   ├── config/             # Viper configuration loading
│   ├── database/           # GORM connection & migration
│   ├── docs/               # Swagger API documentation
│   ├── middleware/         # Auth, rate limiting
│   ├── models/             # GORM models & domain errors
│   ├── notifications/      # WebSocket hub & notifier
│   ├── repository/         # Data access layer
│   ├── seed/               # Seed data generators
│   ├── server/             # Fiber handlers & routes
│   ├── scripts/            # Test & version check scripts
│   ├── test/               # Integration tests
│   ├── main.go             # Application entrypoint
│   ├── go.mod / go.sum     # Go dependencies
│   └── config.yml          # Runtime configuration
│
├── frontend/
│   ├── src/
│   │   ├── api/            # API client wrapper
│   │   ├── components/     
│   │   │   ├── ui/         # Radix UI primitives (button, card, etc.)
│   │   │   └── chat/       # Feature-specific components
│   │   ├── hooks/          # TanStack Query hooks
│   │   ├── lib/            # Utilities (cn, validations)
│   │   ├── pages/          # Route components
│   │   ├── styles/         # Global CSS (Tailwind base)
│   │   ├── test/           # Vitest setup
│   │   └── utils/          # Prefetch logic
│   ├── package.json        # Bun dependencies
│   ├── vite.config.ts      # Vite configuration
│   ├── vitest.config.ts    # Test configuration
│   ├── biome.json          # Biome linter config
│   └── Dockerfile          # Production build (nginx)
│
├── docs/                   # Project documentation
├── scripts/                # Dev utilities
├── compose.yml             # Docker orchestration
├── Makefile                # Development CLI
└── AI_RULES.md             # This file
```

---

## 3. 🎨 Frontend Conventions (React)

### Component Structure

* **Type Safety:** Functional components with **explicitly typed props** using TypeScript interfaces.
* **File Naming:** PascalCase for components (`UserCard.tsx`), camelCase for utilities (`utils.ts`).

### Styling

* **Utility-First:** Use Tailwind utility classes exclusively.
* **Helper Function:** Use `cn()` utility for conditional classes:

  ```tsx
  import { cn } from "@/lib/utils"
  
  <div className={cn("base-class", isActive && "active-class")} />
  ```

* **Avoid Inline Styles:** Never use `style={{}}` prop unless absolutely necessary.

### Icons

* **Lucide React:** Import tree-shakeable icons:

  ```tsx
  import { User, MessageCircle } from "lucide-react"
  ```

### Data Fetching ⚠️ CRITICAL RULE

* 🛑 **NEVER** call `fetch` directly inside components or event handlers.
* ✅ **ALWAYS** wrap data fetching in custom hooks using TanStack Query:

```tsx
// ❌ BAD
function MyComponent() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(setData);
  }, []);
}

// ✅ GOOD
// In hooks/useUsers.ts
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users'),
  });
}

// In component
function MyComponent() {
  const { data, isLoading } = useUsers();
}
```

### UI Components

* **Pattern:** Follow Radix UI + Tailwind (Shadcn-like architecture).
* **Location:** Primitives in `components/ui/`, features in `components/{feature}/`.

### Testing

* **Framework:** Vitest + React Testing Library.
* **Location:** `src/test/` for setup, `*.test.tsx` colocated with components.

### 🛡️ Error Handling & Observability

* **Global Error Boundary:** Wrap the entire application in a robust `ErrorBoundary`.
* **API Error Handling:** Centralize API error parsing in `api/client.ts`. Prefer semantic error messages over raw HTTP status codes.
* **Logging:** Avoid `console.log`. Use a standardized internal `logger` utility that can be configured for different environments.

---

## 4. ⚙️ Backend Conventions (Go/Fiber)

### Handler Signature

All Fiber handlers must follow this signature:

```go
func HandlerName(c *fiber.Ctx) error {
    // Implementation
}
```

### Error Handling (STRICT)

* **Return Errors:** Use the `models.RespondWithError` helper:

  ```go
  if err != nil {
      return models.RespondWithError(c, fiber.StatusBadRequest, 
          models.NewValidationError("invalid input"))
  }
  ```

* **Domain Errors:** Define custom errors in `models/errors.go`:

  ```go
  var (
      ErrUserNotFound = &AppError{Code: "USER_NOT_FOUND", Message: "User not found"}
  )
  ```

* **Structured Responses:**

  ```go
  return c.Status(fiber.StatusOK).JSON(fiber.Map{
      "data": result,
      "meta": fiber.Map{"timestamp": time.Now(), "request_id": c.Locals("requestid")},
  })
  ```

### 🔍 Traceability

* **Request ID:** Every request must have a unique `requestid` generated by middleware.
* **Log Correlation:** All backend logs for a given request MUST include the `requestid`.
* **Header Propagation:** Return `X-Request-ID` to the client in all responses.

### Database (GORM)

* **Type Safety:** Use strictly typed structs with proper tags:

  ```go
  type User struct {
      ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
      Username  string    `gorm:"uniqueIndex;not null" json:"username"`
      Bio       string    `gorm:"type:text" json:"bio"` // Long text
      CreatedAt time.Time `json:"created_at"`
  }
  ```

* **Long Text Fields:** Use `gorm:"type:text"` for content > 255 characters.

* **JSON Fields:** Use `json.RawMessage` with `gorm:"type:json"`:

  ```go
  Metadata json.RawMessage `gorm:"type:json" json:"metadata"`
  ```

  **Do NOT** use `string` for JSON data.

* **Migrations:** In development, `gorm.AutoMigrate` is acceptable. **For production**, use versioned migrations with `golang-migrate`.

* **Context Propagation:** Always pass `context.Context` to database calls:

  ```go
  err := db.WithContext(ctx).Create(&user).Error
  ```

### Configuration

* **Library:** Use **Viper** for environment variable management.
* **File:** Load from `config.yml` via `config.LoadConfig()`.

### JSON Tags

* **Convention:** Always use `snake_case` in JSON tags:

  ```go
  UserID uint `json:"user_id"`  // ✅ Good
  UserID uint `json:"userId"`   // ❌ Bad
  ```

### WebSocket

* **Pattern:** Use hub-based architecture (`notifications/hub.go`, `notifications/chat_hub.go`).
* **Lifecycle:** Hubs must implement proper `Shutdown(ctx)` for graceful cleanup.

---

## 5. 🚫 Strict Prohibitions

> **These are non-negotiable violations:**

* ❌ **No Axios:** Use standard `fetch` or the `api/client.ts` wrapper.
* ❌ **No `useEffect` for Data:** Use **TanStack Query** hooks for all async data.
* ❌ **No Manual Builds or Local Go Commands:** Do NOT run `go build`, `go test`, `go fmt`, or `go mod` commands directly on the host machine. These will hang indefinitely.
  * ✅ **ALWAYS** use the `Makefile`. All development operations (running, testing, formatting, adding dependencies) must have a corresponding `make` target.
  * **Correct Patterns:**
    * `make dev` instead of `docker compose up`
    * `make deps-add-backend pkg=...` instead of `go get ...`
    * `make test` instead of `go test`
* ❌ **No Ignored Errors:** `_ = someFunc()` is **forbidden** except in tests or when explicitly justified with a comment.
* ❌ **No Inline `panic`:** `panic()` is only acceptable during app startup (e.g., config loading failure in `main.go`).
* ❌ **No Raw SQL Strings:** Always use GORM's type-safe query builders.

---

## 6. 📏 Strict Coding Guidelines

### A. Error Handling

#### Zero Tolerance for Ignored Errors

```go
// ❌ FORBIDDEN
_ = someFunc()

// ✅ REQUIRED
if err := someFunc(); err != nil {
    return fmt.Errorf("failed to do something: %w", err)
}

// ✅ ACCEPTABLE (with justification comment)
// We intentionally ignore this error because the hub will retry automatically
_ = s.hub.StartWiring(ctx, s.notifier)
```

#### No `panic` Outside main()

```go
// ❌ BAD (anywhere except main.go)
panic("database connection failed")

// ✅ GOOD
return fmt.Errorf("database connection failed: %w", err)
```

#### Contextual Error Wrapping

Always wrap errors with context:

```go
// ❌ BAD
return err

// ✅ GOOD
return fmt.Errorf("failed to create user %s: %w", username, err)
```

#### Sentinel Errors

Define domain errors in `models/errors.go`:

```go
var (
    ErrNotFound    = &AppError{Code: "NOT_FOUND", Message: "Resource not found"}
    ErrUnauthorized = &AppError{Code: "UNAUTHORIZED", Message: "Unauthorized"}
)

// Usage
if user == nil {
    return models.RespondWithError(c, fiber.StatusNotFound, models.ErrNotFound)
}
```

### B. Concurrency

#### Context First

`context.Context` must be the **first argument** in all long-running functions:

```go
// ✅ CORRECT
func FetchUsers(ctx context.Context, db *gorm.DB, limit int) ([]User, error)

// ❌ WRONG
func FetchUsers(db *gorm.DB, ctx context.Context, limit int) ([]User, error)
```

#### Goroutine Safety

* Use `errgroup` or `sync.WaitGroup` to manage goroutine lifecycle.
* Never spawn "fire and forget" goroutines without cleanup:

```go
// ❌ BAD
go someBackgroundTask()

// ✅ GOOD
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error {
    return someBackgroundTask(ctx)
})
if err := g.Wait(); err != nil {
    return err
}
```

### C. Formatting & Style

#### Tooling

* **Go:** Run `gofmt` or `goimports` on every file before commit.
* **React:** Run `bun run lint:fix` and `bun run format:write` (Biome).

#### Naming Conventions

**Local Scope:** Short, conventional names

```go
ctx := context.Background()
err := doSomething()
db := database.Connect()
```

**Exported Scope:** Descriptive names

```go
type UserRepository struct { ... }
func CreateUserHandler(c *fiber.Ctx) error { ... }
```

**Acronyms:** Consistent casing

```go
ServeHTTP   // ✅ Correct
ID          // ✅ Correct
URL         // ✅ Correct

ServeHttp   // ❌ Wrong
Id          // ❌ Wrong
Url         // ❌ Wrong
```

---

## 7. 🧪 Testing Strategy

### Go Testing

#### Table-Driven Tests

Use table-driven tests for all business logic:

```go
func TestCreateUser(t *testing.T) {
    tests := []struct {
        name    string
        input   CreateUserInput
        want    User
        wantErr bool
    }{
        {
            name: "valid user",
            input: CreateUserInput{Username: "john"},
            want: User{Username: "john"},
            wantErr: false,
        },
        {
            name: "empty username",
            input: CreateUserInput{Username: ""},
            wantErr: true,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := CreateUser(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("CreateUser() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if !tt.wantErr && got.Username != tt.want.Username {
                t.Errorf("CreateUser() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

#### Mocks

* Generate mocks for interfaces using **mockery**:

  ```bash
  mockery --name=UserRepository --output=mocks --outpkg=mocks
  ```

#### Test Location

* **Unit Tests:** `_test.go` files colocated with the code they test.
* **Integration Tests:** `backend/test/` directory for tests requiring Docker containers.

### React Testing

#### Vitest + RTL

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { UserCard } from './UserCard'

describe('UserCard', () => {
  it('renders user name', () => {
    render(<UserCard user={{ name: 'John' }} />)
    expect(screen.getByText('John')).toBeInTheDocument()
  })
})
```

---

## 8. 🌐 API Design Standards

### Endpoints

* **Convention:** Use plural nouns, RESTful verbs.
* **Versioning:** Prefix with `/api/v1/` for future compatibility.

```go
v1 := app.Group("/api/v1")

v1.Get("/users", handlers.GetUsers)           // List
v1.Get("/users/:id", handlers.GetUser)        // Get one
v1.Post("/users", handlers.CreateUser)        // Create
v1.Put("/users/:id", handlers.UpdateUser)     // Update
v1.Delete("/users/:id", handlers.DeleteUser)  // Delete
```

### Request/Response Format

#### Standard Success Response

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-31T12:00:00Z"
  }
}
```

#### Standard Error Response

```json
{
  "error": "User not found",
  "code": "NOT_FOUND",
  "details": "No user exists with ID 123"
}
```

### Pagination

Use `limit` and `offset` query parameters:

```go
type PaginationParams struct {
    Limit  int `query:"limit" validate:"min=1,max=100"`
    Offset int `query:"offset" validate:"min=0"`
}

// Usage
?limit=20&offset=40
```

---

## 9. 🔒 Security Guidelines

### Input Validation

* **Backend:** Validate all request bodies with struct tags and manual checks.
* **Frontend:** Use Zod schemas before submitting data.

```go
// Backend
type CreateUserInput struct {
    Username string `json:"username" validate:"required,min=3,max=20"`
    Email    string `json:"email" validate:"required,email"`
}
```

```tsx
// Frontend
const schema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
})
```

### SQL Injection Protection

* GORM protects by default with parameterized queries.
* **Never** use raw SQL strings or user input concatenation.

### CORS

Configure explicitly in Fiber for production:

```go
app.Use(cors.New(cors.Config{
    AllowOrigins:     os.Getenv("ALLOWED_ORIGINS"), // NOT "*"
    AllowMethods:     "GET,POST,PUT,DELETE,PATCH",
    AllowHeaders:     "Origin,Content-Type,Authorization",
    AllowCredentials: true,
}))
```

### Secrets Management

* Store in `.env` files (gitignored).
* **Never** commit secrets to version control.
* Use strong passwords (minimum 32 characters) in production.

### Authentication

* Use JWT tokens with proper expiration.
* Implement rate limiting on auth endpoints:

  ```go
  authGroup.Use(middleware.RateLimitMiddleware(5, time.Minute))
  ```

---

## 10. 🐳 Docker & Deployment

### Production Images

* **Multi-Stage Builds:** Use builder patterns to minimize image size.
* **Non-Root User:** Always run as non-root in production:

```dockerfile
# Backend example
FROM alpine:3.21
RUN addgroup -g 1000 appgroup && \
    adduser -D -u 1000 -G appgroup appuser

WORKDIR /home/appuser
COPY --from=builder --chown=appuser:appgroup /app/main .

USER appuser
CMD ["./main"]
```

### Build Optimization

```dockerfile
# Optimized Go build
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -a -installsuffix cgo \
    -o main .
```

### Environment Variables

* Use `.env.example` as template (committed).
* Never commit actual `.env` files.
* Validate required vars at startup.

---

## 11. 🚀 Development Workflow

### Makefile Commands

**Development:**

```bash
make dev              # Full stack (backend + frontend + databases)
make dev-backend      # Backend only
make dev-frontend     # Frontend only (local)
```

**Code Quality:**

```bash
make fmt              # Format Go code
make fmt-frontend     # Format React code (Biome)
make lint             # Lint Go code
make lint-frontend    # Lint React code (Biome)
```

**Testing:**

```bash
make test             # Run backend tests
make test-api         # Test API endpoints
```

**Database:**

```bash
make seed             # Seed database with test data
```

**Dependencies:**

```bash
make deps-update      # Update all dependencies
make deps-vuln        # Scan for vulnerabilities
```

---

## 12. 🤖 AI Instructions (Meta-Rules)

**When generating code for VibeShift, you MUST adhere to these rules:**

### 1. **Compile Check**

Always verify the response is syntactically correct and compiles.

### 2. **Package Declaration**

Always provide the `package` line at the top of Go files:

```go
package repository  // ✅
```

### 3. **Complete Imports**

Do not omit imports. Use full, correct import paths:

```go
import (
    "context"
    "fmt"
    
    "vibeshift/models"
    "github.com/gofiber/fiber/v2"
    "gorm.io/gorm"
)
```

### 4. **Contextual Diffs**

When modifying a file, show the surrounding context or the full function for easy application.

### 5. **Error Handling**

**Never** omit error checks in generated snippets. Every error must be handled.

### 6. **Type Annotations**

Always include TypeScript types for React components:

```tsx
interface UserCardProps {
  user: User
  onDelete?: (id: string) => void
}

export function UserCard({ user, onDelete }: UserCardProps) {
  // Implementation
}
```

### 7. **Follow Existing Patterns**

When adding new code, match the existing file structure and naming conventions in the codebase.

### 8. **No Hardcoded Values**

Use configuration variables instead of hardcoded values:

```go
// ❌ BAD
timeout := 30 * time.Second

// ✅ GOOD
timeout := cfg.RequestTimeout
```

### 9. **Comments for Complex Logic**

Add comments explaining **why**, not **what**, for non-obvious code:

```go
// We retry 3 times because the external API is flaky during peak hours
for i := 0; i < 3; i++ {
    // ...
}
```

### 10. **Security First**

Never generate code that:

* Logs sensitive information (passwords, tokens)
* Bypasses authentication/authorization
* Introduces SQL injection risks
* Exposes internal errors to clients

---

## 13. 📊 Code Review Checklist

Before committing code, verify:

### Backend (Go)

* [ ] All errors are handled (no `_ = err`)

* [ ] No `panic()` outside `main.go`
* [ ] Context propagated to all DB/API calls
* [ ] JSON tags use `snake_case`
* [ ] GORM models have proper tags
* [ ] Handlers return proper HTTP status codes
* [ ] Swagger comments updated (if API changed)

### Frontend (React)

* [ ] No direct `fetch()` in components

* [ ] TanStack Query used for data fetching
* [ ] TypeScript types defined for all props
* [ ] Tailwind classes used (no inline styles)
* [ ] Components properly exported
* [ ] Biome linter passes

### General

* [ ] No committed `.env` files

* [ ] Tests updated/added for new features
* [ ] Documentation updated if needed
* [ ] No TODOs or FIXMEs left in code
* [ ] Code formatted with `make fmt` or `make fmt-frontend`

---

## 14. 🎯 Common Patterns

### Creating a New API Endpoint

1. **Define Model** (`models/thing.go`):

```go
type Thing struct {
    ID        uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
    Name      string    `gorm:"not null" json:"name"`
    CreatedAt time.Time `json:"created_at"`
}
```

1. **Create Repository** (`repository/thing.go`):

```go
type ThingRepository struct {
    db *gorm.DB
}

func (r *ThingRepository) Create(ctx context.Context, thing *Thing) error {
    return r.db.WithContext(ctx).Create(thing).Error
}
```

1. **Create Handler** (`server/thing_handlers.go`):

```go
func (s *Server) CreateThing(c *fiber.Ctx) error {
    var input Thing
    if err := c.BodyParser(&input); err != nil {
        return models.RespondWithError(c, fiber.StatusBadRequest, 
            models.NewValidationError("invalid input"))
    }
    
    if err := s.thingRepo.Create(c.Context(), &input); err != nil {
        return models.RespondWithError(c, fiber.StatusInternalServerError,
            models.NewInternalError(err))
    }
    
    return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": input})
}
```

1. **Register Route** (`server/server.go`):

```go
v1.Post("/things", s.CreateThing)
```

1. **Create Frontend Hook** (`hooks/useThings.ts`):

```tsx
export function useCreateThing() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (thing: CreateThingInput) => 
      apiClient.post('/things', thing),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['things'] })
    },
  })
}
```

### Adding WebSocket Support

See `notifications/hub.go` and `notifications/chat_hub.go` for reference patterns.

---

## 15. 🔗 Related Documentation

* **API Architecture:** `docs/API-ARCHITECTURE.md`
* **Frontend Hooks:** `docs/HOOKS-QUICK-REFERENCE.md`
* **Testing Guide:** `backend/TESTING.md`
* **Seeding Data:** `docs/SEEDING.md`
* **Redis Best Practices:** `backend/docs/REDIS_BEST_PRACTICES.md`
* **Git Workflow:** `docs/GIT_BEST_PRACTICES.md`

---

## 16. ⚠️ Known Technical Debt

Current technical debt items tracked for future improvement:

1. **Migration System:** Currently using `gorm.AutoMigrate()` in dev. Need versioned migrations for production.
2. **Rate Limiting:** Basic rate limiting exists. Need per-user rate limiting for API endpoints.
3. **Logging:** Using standard `log` package. Should migrate to structured logging (`slog` or `zerolog`).
4. **Error Context:** Some errors lack sufficient context for debugging. Gradual improvement ongoing.

---

## 🎓 Learning Resources

If you're new to any of these technologies:

* **Go + Fiber:** [Fiber Documentation](https://docs.gofiber.io/)
* **GORM:** [GORM Guides](https://gorm.io/docs/)
* **TanStack Query:** [TanStack Query Docs](https://tanstack.com/query/latest)
* **Radix UI:** [Radix Primitives](https://www.radix-ui.com/primitives)
* **Tailwind CSS:** [Tailwind Docs](https://tailwindcss.com/docs)
* **Biome:** [Biome Linter](https://biomejs.dev/)

---

**Last Updated:** 2026-01-31  
**Version:** 2.0  
**Maintained By:** VibeShift Team

---

*This document is the source of truth for all AI-assisted code generation and code reviews in the VibeShift project. When in doubt, follow these guidelines.*
