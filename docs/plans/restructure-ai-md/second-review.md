Here’s my take on the plan: it’s directionally *very* strong, but it needs a couple of guardrails so it doesn’t accidentally turn into “a documentation system that eats documentation” 🐍📚.

## What’s excellent (keep it)

* **Single “always read” core file**: Consolidating to something like `CLAUDE-CORE.md` is the biggest guaranteed win, because it attacks the “discovery tax” head-on and removes redirect churn.
* **Context layer + lessons layer**: Splitting “how we do things” (`docs/context/*`) from “what we learned from pain” (`docs/lessons/*`) is exactly right for agent work. It directly addresses the “no lessons-learned system” gap the plan calls out.
* **Evolving agent templates**: Turning static templates into incident-informed checklists is how you stop repeating the same GORM/WebSocket/auth mistakes.

## What I’d tweak (so it stays lightweight and actually gets used)

### 1) The token numbers are probably directionally right, but don’t optimize blindly

The plan estimates huge token waste and duplication (15k–25k/session; 70% duplication).
Even if those exact numbers are off, the *pattern* is real: redirects + repeated “repo rules” repeated in multiple places causes agents to reread the same stuff. So: **optimize structure first, measure second**, not the other way around.

**Practical tweak:** Add a tiny “Doc Budget” note in `CLAUDE-CORE.md`:

* “If you need more than 2 context docs, stop and ask: what decision am I missing?”

That prevents “reading the whole library” behavior.

### 2) Don’t replace redirects with more redirects

The plan suggests replacing multiple files with “Moved: see /CLAUDE-CORE.md”.
That’s fine for humans, but some agents will still open those stubs and waste time.

**Better:** delete or drastically shrink to *one* pointer file at repo root (and keep others as real content only if truly domain-specific). If you must keep stubs, make them **one-liners** and ensure agent templates never reference them.

### 3) Automation scripts: avoid “grep-driven hallucinations”

The extraction scripts in the plan are a good starting point, but naïve `grep` will:

* miss lessons that aren’t formatted exactly right
* capture false positives
* duplicate near-identical lessons forever

**Guardrail:** require **structured tags** inside reports (lightweight, but consistent), e.g.

* `Lesson:`
* `Anti-pattern:`
* `Severity:`
* `Detection:` (grepable code pattern)
  Then automation is reliable and boring (boring is good).

### 4) Add an “ADR-lite” so architecture decisions stop re-litigating themselves

The plan mentions “architecture-decisions.md” as missing.
I’d go one step more structured:

* `docs/decisions/0001-auth-tickets.md`
* `docs/decisions/0002-websocket-handshake.md`

Each is short:

* Decision
* Why
* Tradeoffs
* “If you change this, also change…”

This is *gold* for agents because it prevents “why is this weird” rediscovery loops.

### 5) Make “known-issues.md” sharply scoped or it becomes a junk drawer

The plan’s `known-issues.md` is a great idea.
But it needs rules or it turns into a graveyard.

**Rules that work:**

* Each item must have: owner/status, workaround, and “delete when fixed”
* Auto-archive anything older than 30–60 days unless it’s still active

## What I’d do first (highest ROI sequence)

If you do only the parts that create immediate agent behavior change:

1. **Create `CLAUDE-CORE.md`** exactly as proposed (stack, critical rules, command table, where-to-look-next).
2. **Create 3 context docs only** (not 10):

   * `docs/context/backend-patterns.md` (error handling, DB, redis conventions)
   * `docs/context/frontend-patterns.md`
   * `docs/context/auth-and-security.md`
3. **Create `docs/context/known-issues.md`** with strict formatting (active only).
4. **Update only 2 agent templates** (backend + frontend feature agents) to point to:

   * `CLAUDE-CORE.md`
   * the relevant context doc
   * `docs/context/known-issues.md`
   * `docs/lessons/INDEX.md` (even if it’s manual at first)

This already captures most of the benefits described in the “optimized flow” section.

## One extra upgrade I’d add (because you’re building a social platform)

Add a **“Safety rails”** section to `CLAUDE-CORE.md` with 5–8 bullets:

* auth boundaries
* ownership checks
* migrations
* rate limiting / abuse considerations
* logging redaction
* “no hardcoded secrets” (already called out as a recurring critical)

Agents working on social features tend to accidentally step on these landmines.

---

If you want, paste your current `AI.md / CLAUDE.md / AGENTS.md` contents (or upload them), and I’ll draft a tight `CLAUDE-CORE.md` that keeps your real constraints and deletes the fluff 🎯
