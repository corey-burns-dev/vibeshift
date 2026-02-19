# Option A: Configure revive inside `.golangci.yml` (simple, common)

```yaml
# .golangci.yml
run:
  timeout: 5m

linters:
  enable:
    - revive

linters-settings:
  revive:
    # keep it sane: warning by default, crank up a few rules if you want
    severity: warning
    enable-all-rules: false

    # If you want to allow common patterns in tests, you can exclude paths here too
    # (golangci also supports issues.exclude-rules)
    # ignore-generated-header: true

    rules:
      # --- High signal, low annoyance ---
      - name: exported
        severity: warning
        # exported functions/types should have comments (public API hygiene)
        arguments:
          - "checkPrivateReceivers" # optional; remove if it nags too much

      - name: var-naming
        severity: warning

      - name: package-comments
        severity: warning

      - name: error-naming
        severity: warning

      - name: error-return
        severity: warning

      - name: if-return
        severity: warning

      - name: redundant-import-alias
        severity: warning

      - name: unused-parameter
        severity: warning

      - name: unnecessary-stmt
        severity: warning

      - name: indent-error-flow
        severity: warning

      # --- Optional “nice to have” rules (uncomment if your team likes them) ---
      # - name: early-return
      # - name: empty-lines
      # - name: bare-return
      # - name: range
      # - name: context-keys-type
```

**Why this mix works well:**

* It catches classic Go “paper cuts” (unnecessary `else`, awkward error flow, exported comment discipline).
* It avoids the “style police siren” rules that explode PR noise in real services.

---

## Option B: Use a dedicated revive config file (more control)

Create `revive.toml`:

```toml
# revive.toml
severity = "warning"
ignoreGeneratedHeader = true

[rule.exported]
severity = "warning"
arguments = ["checkPrivateReceivers"]

[rule.var-naming]
severity = "warning"

[rule.package-comments]
severity = "warning"

[rule.error-naming]
severity = "warning"

[rule.error-return]
severity = "warning"

[rule.if-return]
severity = "warning"

[rule.redundant-import-alias]
severity = "warning"

[rule.unused-parameter]
severity = "warning"

[rule.unnecessary-stmt]
severity = "warning"

[rule.indent-error-flow]
severity = "warning"
```

Then point `golangci-lint` at it:

```yaml
# .golangci.yml
linters:
  enable:
    - revive

linters-settings:
  revive:
    config: revive.toml
```

---

## Two tiny “make it livable” tweaks (highly recommended) 🧯

### 1) Don’t punish tests for being chatty

Tests often use exported helpers or “unused params” in table-driven patterns. Add an exclude:

```yaml
issues:
  exclude-rules:
    - path: _test\.go
      linters:
        - revive
      text: "exported|unused-parameter"
```

(Adjust the `text:` to whatever actually bugs you in your repo.)

### 2) Let generated code be messy

You usually want to ignore `mock_*.go`, `*.pb.go`, etc.

```yaml
issues:
  exclude-files:
    - ".*\\.pb\\.go"
    - "mock_.*\\.go"
```

---

If you tell me your repo vibe (library vs backend service, and whether you enforce doc comments on exported stuff), I’ll tune this config so it nags like a friendly reviewer, not a haunted typewriter. 😄🪶
