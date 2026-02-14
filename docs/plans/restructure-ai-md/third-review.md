Alright, forging the **project brain** 🧠⚙️
Below is a *real, working* `CLAUDE-CORE.md` designed specifically for how your repo actually behaves, not a generic AI template.

You would place this at repo root:

```
/CLAUDE-CORE.md
```

Everything else becomes optional reading.

---

# CLAUDE-CORE.md

## 1. What this project is

Sanctum is a realtime social platform.

Core properties:

* Users create posts
* Users comment
* Users join live chat rooms
* Presence matters (online/offline state)
* Realtime correctness > eventual consistency
* Security boundaries matter more than performance

This is **not CRUD with decorations**
It is a stateful multiplayer system.

If something breaks, it is usually:

> state synchronization, not database schema

---

## 2. System Mental Model

Think of the backend as 3 interacting subsystems:

### Persistence Layer

Postgres = source of truth
Used for:

* accounts
* posts
* comments
* relationships
* durable events

Rules:

* Never trust cache over database
* Writes must succeed here or the action did not happen

---

### Realtime Layer

Websocket hub = temporary shared memory

Used for:

* chat
* presence
* notifications
* live updates

Rules:

* Losing websocket state must not corrupt database
* Realtime is allowed to be stale but never authoritative

---

### Cache Layer

Redis = acceleration + coordination

Used for:

* sessions
* rate limiting
* presence tracking
* ephemeral data

Rules:

* Cache may be wiped at any time
* System must recover automatically

---

## 3. Hard Invariants (never violate)

### Identity

Every action must be tied to an authenticated user.
No implicit identity.
No trusting client IDs.

---

### Ownership

User must own or have permission for:

* editing posts
* deleting content
* moderating rooms

Never rely on frontend checks.

---

### Database Safety

Never:

* run destructive migrations automatically
* change column meaning silently
* depend on nullable auth fields

---

### Realtime Safety

Websocket events must always validate:

* auth
* room membership
* permissions

Do not trust connection state.

---

### Cache Safety

Redis loss must not break:

* login
* posting
* comments
* chat reconnect

If redis disappears → system degrades, not crashes.

---

## 4. Known Dangerous Areas

These parts historically cause regressions:

### Auth/session handling

Typical bug:
User authenticated in HTTP but not websocket

Always verify session inside WS handshake.

---

### Presence tracking

Online lists drift if disconnect not handled.
Always implement timeout cleanup.

---

### Post/comment relationships

Deleting parent objects must not orphan records in UI.

Soft delete preferred over hard delete in most cases.

---

### Race conditions

Common when:

* user sends message while joining room
* rapid reconnect
* multiple tabs

Never assume order of events from client.

---

## 5. How to Work in This Repo

### Before coding

Read:

```
docs/context/known-issues.md
docs/lessons/INDEX.md
```

### When changing behavior

If modifying:

* auth
* websocket
* database schema
* caching logic

You must explain reasoning in report.

---

### After coding

Create report:

```
docs/reports/YYYY-MM-DD-HHMM-topic.md
```

Include:

* what changed
* why
* risks
* future pitfalls

Reports are project memory.

---

## 6. Where to Look Next

| Task                | Read                              |
| ------------------- | --------------------------------- |
| Backend behavior    | docs/context/backend-patterns.md  |
| Frontend behavior   | docs/context/frontend-patterns.md |
| Auth/security       | docs/context/auth-and-security.md |
| Historical problems | docs/lessons/INDEX.md             |
| Active problems     | docs/context/known-issues.md      |

Do not read entire docs folder unless necessary.

---

## 7. Development Philosophy

Correctness > cleverness
Predictability > abstraction
Explicit state > hidden magic

Prefer boring solutions that survive multiplayer chaos.

---

## 8. Golden Rule

If unsure:

The database is reality
Realtime is a projection
Cache is a rumor

Design accordingly.

---

---

## What this file accomplishes

An agent reading only this will now understand:

* what kind of app this is
* what breaks often
* what must never break
* where to learn more

Which means it stops behaving like a random contractor and starts behaving like a returning teammate who remembers the haunted parts of the house 🏚️

---

Next step after this:
we shrink your existing AI.md / AGENTS.md into simple pointers so the agent always lands here first.
