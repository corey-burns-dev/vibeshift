## Title

Rate-Limit-Aware AI Stress Reporting (Medium/High Profiles)

## Summary

Upgrade the existing AI stress analyzer so medium/high runs correctly identify rate limiting (429s) as a primary bottleneck, and deterministically mark runs as `CRITICAL` when failure thresholds are breached. Scope is limited to analyzer/reporting and docs (no load profile or backend behavior changes).

## Important Interface Changes

1. `scripts/ai_stress_report.py` output contract updates:

- `logs.json` will include categorized Loki results, not just one query:
  - `queries[]` with `name`, `query`, `entry_count`
  - `entries[]` with added `category` field (`severity` or `rate_limit`)
- `ai-analysis.json` will include deterministic sections:
  - `rate_limit_signals` (counts + endpoint/check evidence)
  - `deterministic_status` (computed status and reasons)

2. Report rendering updates (`report.html`, `report.md`, `report.txt`):

- Add explicit “Rate Limit Signals” section with:
  - Loki 429/rate-limit sample count
  - Failed check pass-rates for write-heavy endpoints
  - Endpoint-level bottleneck callouts
- Rename Loki sample section to indicate it includes rate-limit evidence.

3. Status policy:

- Final status is threshold-driven and enforced after model output:
  - `CRITICAL` when `http_req_failed` exceeds profile threshold OR any primary write-check pass rate `< 20%`
  - `WARNING` for non-critical degradations
  - `HEALTHY` otherwise

## Implementation Plan

1. Extend Loki collection in `scripts/ai_stress_report.py`.

- Replace single Loki query with two fixed queries:
  - `severity`: `{container=~".+"} |~ "(?i)(error|warn|panic|fatal)"`
  - `rate_limit`: `{container=~".+"} |= "request processed" |= "status=429"`
- Keep a shared fetch path and append `category` to each collected entry.
- Preserve backward compatibility by keeping top-level `entries`, while adding `queries`.

1. Add deterministic signal extraction from k6 summary.

- Parse `summary.json`:
  - `metrics.http_req_failed.value`
  - threshold expression from `metrics.http_req_failed.thresholds` (parse numeric limit from `rate<...`; fallback to profile default if missing)
  - `root_group.checks` pass/fail for these canonical checks:
    - `create post status 201`
    - `comment status ok`
    - `friend request status acceptable`
    - `dm send status acceptable`
- Compute per-check pass rate and mark “severely constrained” if pass rate `< 0.20`.

1. Add rate-limit diagnosis heuristics.

- Build `rate_limit_signals` with:
  - `loki_rate_limit_entry_count`
  - `critical_write_checks[]` with pass/fail stats and pass rate
  - `likely_rate_limited_endpoints[]` mapped from failing checks
- Inject these signals into the Ollama prompt payload so the model sees explicit 429 context.

1. Enforce deterministic status after AI response.

- New function `apply_status_policy(...)`:
  - Calculates `deterministic_status` + `reasons[]`
  - Final status = max severity between model status and deterministic status
  - If deterministic escalation happens, append explicit finding and likely cause.
- Apply same policy to fallback analysis path so behavior is consistent with/without Ollama.

1. Update report rendering.

- `report.html`: add Rate Limit Signals card/table and show deterministic reasons.
- `report.md` / `report.txt`: add sections:
  - `Deterministic Status Policy Result`
  - `Rate Limit Signals`
- Keep existing sections intact to minimize downstream tooling impact.

1. Update operations documentation.

- Edit `docs/operations/stress-testing.md`:
  - Clarify that medium/high runs can fail primarily due to endpoint rate limits.
  - Add interpretation guidance:
    - Difference between throughput bottlenecks vs policy bottlenecks (429s).
    - How to read new Rate Limit Signals section.
  - Add troubleshooting note that 429s are now sourced from INFO-level request logs.

## Data Flow

1. Read run artifacts (`metadata.json`, `summary.json`).
2. Collect Prometheus metrics (unchanged).
3. Collect Loki logs using both `severity` and `rate_limit` queries.
4. Extract deterministic failure/rate-limit signals from k6 checks + Loki.
5. Build prompt including these signals.
6. Call Ollama; parse model JSON.
7. Apply deterministic status policy override.
8. Write `metrics.json`, `logs.json`, `ai-analysis.json`, then render reports and index.

## Edge Cases and Failure Modes

1. Loki unavailable:

- `rate_limit_signals` still populated from k6 check pass rates.
- Analysis remains functional with degraded Loki health.

2. Missing `root_group.checks`:

- Fall back to `http_req_failed` threshold-only deterministic rule.

3. Non-standard check names in future scripts:

- Unknown checks ignored; only canonical names affect severe write-check rule.

4. Missing/invalid threshold expression:

- Use profile default thresholds (`low=0.05`, `medium=0.08`, `high=0.10`).

5. Ollama failure/non-JSON:

- Fallback analysis still receives deterministic policy enforcement.

## Test Cases and Scenarios

1. Reproduce medium run from `tmp/stress-runs/20260213T221532Z-medium`:

- Expect non-empty `rate_limit` Loki query results when logs exist.
- Expect `rate_limit_signals` populated with failing write checks.
- Expect final status escalated to `CRITICAL` under policy.

2. Healthy low run:

- No critical write-check failures; status stays `HEALTHY`/`WARNING` based on thresholds.

3. Loki-down simulation:

- `loki` health is `degraded`; deterministic logic still computes status from k6 data.

4. Ollama-down simulation:

- Fallback analysis generated; deterministic status present and enforced.

5. Regression check:

- `make ai-report` still generates `report.html`, `report.md`, `report.txt`, and updates `tmp/stress-runs/index.html`.

## Assumptions and Defaults

1. Scope excludes k6 script/profile redesign and backend rate-limit tuning.
2. 429s are treated as first-class failures for certification decisions.
3. Canonical write-check names in `load/scripts/social_mixed.js` remain unchanged.
4. Existing artifact paths and Make targets remain the same.
