# Feature Flag Strategy

This repository uses a lightweight backend feature-flag manager for controlled rollouts.

## Config

Use `FEATURE_FLAGS` as a comma-separated key/value list:

```text
FEATURE_FLAGS="new_feed=10%,beta_chat=off,ops_toggle=on"
```

Supported values:

- `on` / `off` (`true`/`false`, `1`/`0` also supported)
- `N%` for deterministic user-based rollout (for example `25%`)

Implementation:

- Parser/evaluator: `backend/internal/featureflags/manager.go`
- Tests: `backend/internal/featureflags/manager_test.go`
- Admin visibility endpoint: `GET /api/admin/feature-flags`

## Rollout Playbook

1. Add the new feature behind a named flag.
2. Deploy with the flag `off`.
3. Enable to a small cohort (`1%`, `5%`, `10%`).
4. Watch error rate, latency, and user feedback.
5. Increase rollout gradually.
6. Set to `on` after stability is confirmed.
7. Remove stale flags in follow-up cleanup.

## Safety Defaults

- Unknown flags evaluate to `false`.
- Invalid values evaluate to `false`.
- Percentage rollouts require a user ID for deterministic bucketing.
