# 🧠 VibeShift: AI Coding Standards & Context

> **Project Name:** VibeShift
> **Purpose:** AI Context & Style Guide for maintaining code quality, consistency, and architectural integrity.

---

## 1. 🛠️ Tech Stack Boundaries

| Category | Technology | Notes |
| :--- | :--- | :--- |
| **Frontend Runtime** | **Bun** | Use `bun install`, `bun run` |
| **Frontend Framework** | **React v19 + Vite** | |
| **Language** | **Go (Golang)** | Framework: **Fiber v2** |
| **Styling** | **Tailwind CSS v4** | CSS-first config (No `tailwind.config.js`) |
| **Linting** | **Biome** | 🚫 **No** ESLint or Prettier |
| **State (Server)** | **TanStack Query v5** | For all API data fetching |
| **State (Client)** | **Zustand** | For global UI state |
| **Routing** | **React Router v7** | |
| **Forms** | **RHF + Zod** | React Hook Form validated by Zod |

---

## 2. 🎨 Frontend Conventions (React)

* **Component Structure:** Functional components with **explicitly typed props** (interfaces/types).
* **Styling:**
  * Use `clsx` and `tailwind-merge` via a `cn()` utility helper.
  * Avoid inline styles; rely on Tailwind utility classes.
* **Icons:** Use `lucide-react`.
* **Data Fetching:**
  * 🛑 **NEVER** call `fetch` directly inside components.
  * ✅ **ALWAYS** create a custom hook using `useQuery` or `useMutation`.
* **UI Library:** Follow the **Radix UI + Tailwind** pattern (Shadcn-like architecture).
* **Testing:** Vitest + React Testing Library.

---

## 3. ⚙️ Backend Conventions (Go/Fiber)

* **Handler Signature:**

    ```go
    func(c *fiber.Ctx) error
    ```

* **Error Handling:**
  * Do not panic.
  * Return structured JSON errors:

        ```go
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "..."})
        ```

* **Database (GORM):**
  * Use **strictly typed structs**.
  * **Long Text:** Use `type:text` for content > 255 chars.
  * **JSON Fields:** Use `json.RawMessage` with `gorm:"type:json"`. **Do NOT** use string for JSON data.
* **Configuration:** Use **Viper** for environment variable management.
* **JSON Tags:** Always use `snake_case` (e.g., `json:"user_id"`).

---

## 4. 🚫 Specific "Don'ts"

> **Strict Prohibitions:**
>
> * ❌ **No Axios:** Use standard `fetch` or a lightweight wrapper.
> * ❌ **No `useEffect` for Data:** Use **TanStack Query** for all async data.
> * ❌ **No Manual Builds:** Do not run `go build` or `go test` directly.
>   * ✅ Use `make build`, `make test`, or `make dev` (Docker).

---

## 5. 📏 Strict Coding Guidelines

### A. Error Handling

* **Zero Tolerance:** NEVER ignore errors. `_` assignment for errors is forbidden.
* **No Panics:** `panic` is only acceptable during app startup (e.g., config loading failure).
* **Contextual Wrapping:**

    ```go
    // Bad
    return err
    // Good
    return fmt.Errorf("failed to create user: %w", err)
    ```

* **Sentinel Errors:** Define domain errors in `internal/domain/errors.go` (e.g., `ErrNotFound`, `ErrConflict`) to map cleanly to HTTP status codes.

### B. Concurrency

* **Context First:** `context.Context` must be the first argument in all long-running functions (DB calls, external APIs).
* **Goroutine Safety:** Use `errgroup` or `sync.WaitGroup` to manage lifecycle. Never spawn "fire and forget" goroutines without cleanup.

### C. Formatting & Style

* **Tooling:** Run `gofmt` or `goimports` on every file.
* **Naming:**
  * Local scope: Short (`ctx`, `err`).
  * Exported scope: Descriptive (`UserRepository`).
  * Acronyms: Consistent (e.g., `ServeHTTP`, `ID`, `URL` — **not** `ServeHttp`, `Id`, `Url`).

---

## 6. 🧪 Testing Strategy

* **Style:** Table-Driven Tests for all business logic.
* **Mocks:** Generate mocks for interfaces using **mockery** or **gomock**.
* **Location:**
  * **Unit Tests:** `_test.go` files sit next to the code they test.
  * **Integration Tests:** Live in a separate `/tests` folder if they require container spin-up.

---

## 7. 🤖 AI Instructions (Meta-Rules)

**When generating code for VibeShift, you must adhere to these rules:**

1. **Compile Check:** Always verify the response is syntactically correct and compiles.
2. **Package Declaration:** Always provide the `package` line at the top of the file.
3. **Imports:** Do not omit imports; use full, correct import paths.
4. **Contextual Diffs:** If modifying a file, show the surrounding context or the full function so the user can easily apply the change.
5. **Error Handling:** Never omit error checks in generated snippets.
