# Feature-Level Review Workflow

A practical, scalable approach to maintaining production quality as you add new features without doing a full system review each time.

---

## Philosophy

**Small changes, small reviews. Big changes, bigger reviews.**

The key is having:
1. **Automated checks** that run on every change
2. **Scope-based review checklists** that scale with change size
3. **Critical-path verification** that ensures core functionality isn't broken

---

## 🔄 Three-Tier Review System

### Tier 1: Automatic (Every Commit)
**Time: 2-5 minutes** | **Effort: Zero** | **Runs: Automatically**

This happens automatically in your CI/CD pipeline. No manual effort required.

```yaml
# .github/workflows/feature-check.yml
name: Feature Quality Check

on: [pull_request]

jobs:
  automated-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Backend checks
      - name: Go Lint
        run: cd backend && golangci-lint run
      
      - name: Go Tests
        run: cd backend && go test ./... -race -cover
      
      - name: Security Scan
        run: |
          # Check for secrets in diff
          git diff origin/main -- . | grep -i "password\|secret\|api_key" && exit 1 || exit 0
      
      # Frontend checks  
      - name: TypeScript Check
        run: cd frontend && bun run type-check
      
      - name: Frontend Lint
        run: cd frontend && bun run lint
      
      - name: Frontend Tests
        run: cd frontend && bun test
      
      # Build verification
      - name: Build Backend
        run: cd backend && go build ./cmd/server
      
      - name: Build Frontend
        run: cd frontend && bun run build
```

**What this catches:**
- Syntax errors
- Type errors
- Lint violations
- Test failures
- Build failures
- Accidental secrets

---

### Tier 2: Self-Review Checklist (Every Feature)
**Time: 10-15 minutes** | **Effort: Medium** | **Runs: Before creating PR**

Use this checklist for EVERY new feature, route, or significant change. Copy this into your PR template.

```markdown
## Feature Self-Review Checklist

**Feature:** [Brief description]
**Files Changed:** [Count]
**Routes Added/Modified:** [List]

### Security (REQUIRED)
- [ ] **Authentication**: Is this endpoint/feature properly authenticated?
- [ ] **Authorization**: Are permission checks in place (who can access this)?
- [ ] **Input Validation**: All user inputs validated (backend AND frontend)?
- [ ] **SQL Injection**: No string concatenation in queries?
- [ ] **XSS Prevention**: User content properly escaped in frontend?
- [ ] **Rate Limiting**: Should this endpoint be rate limited? (Is it?)

### Error Handling (REQUIRED)
- [ ] **No Ignored Errors**: Search for `_ = ` in my changes - all handled?
- [ ] **HTTP Errors**: Proper status codes (400, 401, 403, 404, 500)?
- [ ] **Error Messages**: User-friendly without leaking system details?
- [ ] **Logging**: Errors logged with enough context to debug?

### Database (IF APPLICABLE)
- [ ] **Migration**: Created if schema changed?
- [ ] **Rollback**: Migration has proper down.sql?
- [ ] **Indexes**: Queries have appropriate indexes?
- [ ] **Transactions**: Used where needed for data consistency?
- [ ] **N+1 Queries**: No accidental N+1 patterns?

### Testing (REQUIRED)
- [ ] **Unit Tests**: New business logic has tests?
- [ ] **Integration Test**: New endpoint has API test?
- [ ] **Happy Path**: Main feature flow tested?
- [ ] **Error Cases**: At least one error case tested?
- [ ] **Manual Test**: I actually tried this feature locally?

### Performance (IF APPLICABLE)
- [ ] **Pagination**: Implemented if returning lists?
- [ ] **Caching**: Considered Redis caching if appropriate?
- [ ] **Query Optimization**: EXPLAIN ANALYZE run on new queries?
- [ ] **Goroutines**: No unbounded goroutine creation?

### Code Quality (REQUIRED)
- [ ] **No TODOs**: Or they're tracked in an issue?
- [ ] **No Debug Code**: console.log, print statements removed?
- [ ] **DRY**: Not duplicating existing code?
- [ ] **Readable**: Would another dev understand this?

### Documentation (IF NEEDED)
- [ ] **API Docs**: Swagger/OpenAPI updated?
- [ ] **Comments**: Complex logic has explanatory comments?
- [ ] **README**: Updated if setup/usage changed?
```

**How to use:**
1. Copy this checklist into your PR description
2. Check off each item as you verify it
3. Fix any issues you find
4. Only create PR when all boxes checked

**Time saver:** Create a script to add this to every PR:
```bash
# scripts/create-pr.sh
#!/bin/bash
cat .github/PULL_REQUEST_TEMPLATE.md | gh pr create --fill
```

---

### Tier 3: Focused Code Review (Features with Complexity/Risk)
**Time: 30-60 minutes** | **Effort: High** | **Runs: For risky changes**

Use this for features that:
- Touch authentication/authorization
- Modify WebSocket functionality  
- Change database schema
- Handle payments or sensitive data
- Modify core business logic
- Could impact multiple users simultaneously

#### Focused Review Prompt

```markdown
# Focused Feature Review

## Feature Context
**Feature Name:** [Name]
**Risk Level:** [Low/Medium/High]
**Touched Systems:** [Auth / Database / WebSockets / etc.]
**User Impact:** [How many users / which flows]

## Review Scope

Review ONLY the files changed in this PR with focus on:

### 1. Security Impact Analysis
- What new attack surface does this create?
- What happens if inputs are malicious?
- Can unauthorized users access this?
- What data is exposed in responses?

### 2. Data Integrity
- Can this cause data corruption?
- Are race conditions possible?
- Is referential integrity maintained?
- What happens if this fails mid-operation?

### 3. Error Propagation
For each new function/handler:
- What errors can occur?
- Are they all handled?
- Do they propagate correctly?
- Are users informed appropriately?

### 4. Performance Impact
- Does this add new database queries?
- Are those queries indexed?
- Could this cause a bottleneck?
- How does it perform with 100, 1000, 10000 records?

### 5. Regression Risk
- Could this break existing features?
- What flows might be affected?
- Have related tests been updated?

## Testing Verification

### Test the Change:
- [ ] Feature works as expected (happy path)
- [ ] Error handling works (try to break it)
- [ ] Doesn't break existing features
- [ ] Performance is acceptable
- [ ] Works with concurrent requests (if applicable)

### Review the Tests:
- [ ] New tests actually test the feature
- [ ] Tests would catch regressions
- [ ] Error cases are tested
- [ ] Edge cases are covered

## Specific Checks by System

### If Touches Auth:
- [ ] Token validation correct?
- [ ] Permission checks in place?
- [ ] Session handling secure?

### If Touches Database:
- [ ] Migration is safe?
- [ ] Indexes exist?
- [ ] No N+1 queries?
- [ ] Transactions used correctly?

### If Touches WebSockets:
- [ ] Connection cleanup?
- [ ] Message validation?
- [ ] Rate limiting?
- [ ] Broadcast efficiency?

### If Touches API:
- [ ] Rate limiting needed?
- [ ] Input validation?
- [ ] Proper status codes?
- [ ] Response format consistent?

## Sign-off

- [ ] All security concerns addressed
- [ ] All data integrity concerns addressed
- [ ] All error handling verified
- [ ] Performance is acceptable
- [ ] Tests provide good coverage
- [ ] No regressions detected

**Reviewer:** [Name]
**Reviewed:** [Date]
```

---

## 🎯 Decision Matrix: Which Tier?

Use this to decide how much review effort is needed:

```
┌─────────────────────────────────────────────────────────────┐
│ Change Type                           │ Tier │ Time         │
├───────────────────────────────────────┼──────┼──────────────┤
│ Fix typo in comment                   │  1   │ 2 min        │
│ Update dependency version             │  1   │ 2 min        │
│ Add frontend component (no API)       │  1   │ 5 min        │
│ Refactor without behavior change      │  1   │ 5 min        │
├───────────────────────────────────────┼──────┼──────────────┤
│ Add new API endpoint (simple CRUD)    │  2   │ 15 min       │
│ Add new UI page                       │  2   │ 15 min       │
│ Modify existing feature (low risk)    │  2   │ 15 min       │
│ Bug fix (non-critical)                │  2   │ 15 min       │
├───────────────────────────────────────┼──────┼──────────────┤
│ New auth feature                      │  3   │ 60 min       │
│ Database schema change                │  3   │ 45 min       │
│ WebSocket modification                │  3   │ 45 min       │
│ Payment integration                   │  3   │ 90 min       │
│ Critical bug fix                      │  3   │ 60 min       │
│ Security patch                        │  3   │ 60 min       │
└───────────────────────────────────────┴──────┴──────────────┘
```

**Rule of thumb:**
- Lines changed < 50: Tier 1
- Lines changed 50-300: Tier 2
- Lines changed > 300 OR touches critical systems: Tier 3

---

## 🤖 Automated Quality Gates

Set up automatic blocking for common issues:

### Pre-commit Hook
```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🔍 Running pre-commit checks..."

# Check for debugging statements
if git diff --cached | grep -E "console\.log|fmt\.Println|debugger"; then
    echo "❌ Debug statements found. Remove before committing."
    exit 1
fi

# Check for ignored errors in Go files
if git diff --cached --name-only | grep "\.go$" | xargs grep "_ = " | grep -v "_test.go"; then
    echo "⚠️  Warning: Ignored errors found. Are these intentional?"
    echo "Press Enter to continue or Ctrl+C to abort..."
    read
fi

# Check for TODOs without issue numbers
if git diff --cached | grep -E "TODO|FIXME" | grep -v "#[0-9]"; then
    echo "⚠️  Warning: TODOs found without issue numbers."
    echo "Press Enter to continue or Ctrl+C to abort..."
    read
fi

echo "✅ Pre-commit checks passed"
```

Install with: `cp .git/hooks/pre-commit.sample .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`

### GitHub Actions Quality Gate
```yaml
# .github/workflows/quality-gate.yml
name: Quality Gate

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Check PR Checklist Completed
        run: |
          # Ensure PR description has checkboxes and they're checked
          gh pr view ${{ github.event.pull_request.number }} --json body | \
            jq -r '.body' | \
            grep -E "\[x\].*Security.*Authentication" || \
            (echo "❌ Security checklist not completed" && exit 1)
      
      - name: Check Test Coverage Delta
        run: |
          # Ensure new code has tests
          # (simplified - use actual coverage tools)
          echo "Checking test coverage..."
      
      - name: Security Scan Changed Files
        run: |
          # Scan only changed files for security issues
          git diff origin/main...HEAD --name-only | \
            xargs trivy fs --severity HIGH,CRITICAL
```

---

## 📁 Organizing Your Workflow

### PR Template
Create `.github/pull_request_template.md`:

```markdown
## Description
[Brief description of the change]

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Self-Review Checklist

### Security ✓
- [ ] Authentication/Authorization verified
- [ ] Input validation implemented
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Rate limiting considered

### Error Handling ✓
- [ ] No ignored errors (`_ = `)
- [ ] Appropriate HTTP status codes
- [ ] User-friendly error messages
- [ ] Errors logged with context

### Database (if applicable)
- [ ] Migration created with rollback
- [ ] Indexes added for new queries
- [ ] No N+1 query patterns
- [ ] Transactions used appropriately

### Testing ✓
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed
- [ ] Edge cases tested

### Code Quality ✓
- [ ] No debug code (console.log, print)
- [ ] No untracked TODOs
- [ ] Code is readable
- [ ] No duplicated code

## Testing Performed
[Describe what you tested]

## Related Issues
Closes #[issue number]

## Screenshots (if applicable)
[Add screenshots]

## Deployment Notes
[Any special deployment considerations]
```

### Commit Message Convention
Enforce this with a commit-msg hook:

```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `sec`: Security fix
- `perf`: Performance improvement
- `refactor`: Code refactoring
- `test`: Adding tests
- `docs`: Documentation
- `chore`: Maintenance

Example:
```
feat(chat): add message reactions

- Add reaction endpoints to API
- Update chat UI to show reactions
- Add database migration for reactions table

Closes #123
```

---

## 🎬 Real-World Example Workflow

Let's walk through adding a new feature: **"User can edit their posts"**

### Step 1: Automated (Happens automatically)
```bash
git checkout -b feature/post-editing
# ... make changes ...
git add .
git commit -m "feat(posts): add post editing capability"
# Pre-commit hook runs automatically ✓
git push origin feature/post-editing
# GitHub Actions run automatically ✓
```

### Step 2: Self-Review (15 minutes)
```markdown
## Feature Self-Review: Post Editing

### Security
- [x] Authentication: EditPost handler checks auth ✓
- [x] Authorization: User can only edit their own posts ✓
- [x] Input validation: Title/content validated ✓
- [x] SQL Injection: Using parameterized queries ✓
- [x] XSS Prevention: Frontend escapes content ✓
- [x] Rate limiting: Using existing post endpoints limiter ✓

### Error Handling
- [x] No ignored errors: Checked all new code ✓
- [x] HTTP errors: Returns 403 if not owner, 404 if not found ✓
- [x] Error messages: "Cannot edit post you don't own" ✓
- [x] Logging: Logs edit attempts with user_id and post_id ✓

### Database
- [x] Migration: Added `edited_at` column migration ✓
- [x] Rollback: down.sql removes column ✓
- [x] Indexes: Using existing post_id index ✓
- [x] Transactions: Single UPDATE, no transaction needed ✓
- [x] N+1 Queries: No loops, single query ✓

### Testing
- [x] Unit test: TestEditPost_Success ✓
- [x] Unit test: TestEditPost_NotOwner ✓
- [x] Unit test: TestEditPost_NotFound ✓
- [x] Integration test: API test for PUT /posts/:id ✓
- [x] Manual test: Edited posts in browser ✓

### Performance
- [x] Not returning lists, no pagination needed ✓
- [x] No caching needed (single post operation) ✓
- [x] Query checked with EXPLAIN ANALYZE ✓

### Code Quality
- [x] No TODOs ✓
- [x] No console.log ✓
- [x] Reused existing validation helpers ✓
- [x] Added comments to explain ownership check ✓

All boxes checked! Ready for PR.
```

### Step 3: Create PR with checklist
```bash
gh pr create --fill
# PR template auto-fills with checklist
# Mark items as you've verified them
```

### Step 4: Peer Review (Optional but recommended)
For this feature: **Low risk** (simple CRUD operation)
- Quick peer review: 5-10 minutes
- Reviewer focuses on: Authorization logic, tests

For riskier features: **Use Tier 3 focused review**

---

## 📊 Metrics to Track

Keep these metrics to ensure quality doesn't slip:

```markdown
# Monthly Quality Metrics

## Code Quality
- PRs merged: [X]
- Average PR review time: [X hours]
- PRs requiring changes: [X]%
- Test coverage: [X]%

## Issues Found
- Critical issues in production: [X]
- High priority bugs: [X]
- Security issues: [X]
- Performance issues: [X]

## Review Effectiveness
- Issues caught in review: [X]
- Issues caught in testing: [X]
- Issues caught in production: [X]

## Goal: Issues caught in review > Issues in production
```

---

## 🚨 When to Do a Full Review Again

Trigger a full production review when:
- **Time-based**: Every 3-6 months
- **Change-based**: After 100+ PRs merged
- **Event-based**: 
  - Before major version release
  - After security incident
  - Before scaling to new user tier (1k → 10k → 100k users)
  - When adding new critical features (payments, etc.)
  - After major dependency updates

---

## ⚡ Quick Reference Card

Print this and keep it visible:

```
┌─────────────────────────────────────────────────────────┐
│           EVERY FEATURE MUST HAVE                       │
├─────────────────────────────────────────────────────────┤
│  🔐 Security: Auth + Authz + Validation                 │
│  ⚠️  Error Handling: No ignored errors                  │
│  🧪 Tests: At least happy path + one error case         │
│  📝 Review: Self-review checklist completed             │
│  ✅ CI: All automated checks passing                    │
└─────────────────────────────────────────────────────────┘

Before creating PR, ask:
1. Can unauthorized users access this?
2. What happens if this fails?
3. Did I test the error cases?
4. Would a new dev understand this code?
5. Is production data safe?

If any answer is concerning → Tier 3 review
```

---

## Summary

**The key to sustainable quality:**
1. **Automate everything possible** (Tier 1)
2. **Make self-review a habit** (Tier 2)  
3. **Invest in deep review when needed** (Tier 3)
4. **Track metrics** to ensure it's working

**Time investment:**
- Tier 1: 0 minutes (automated)
- Tier 2: 15 minutes per feature
- Tier 3: 60 minutes per risky feature

**This is sustainable because:**
- 80% of features are Tier 1-2 (15 min or less)
- 20% of features need Tier 3 (where risk is highest)
- Full reviews are rare (quarterly)

**Result:** Production quality maintained, velocity stays high.
