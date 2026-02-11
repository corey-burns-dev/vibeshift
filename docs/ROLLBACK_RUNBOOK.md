# Rollback Runbook

This runbook defines a rollback-ready process for production deploys.

## Release Discipline

1. Deploy from an immutable git ref (tag or commit SHA), not an unpinned branch head.
2. Record deployed ref in release notes / PR.
3. Keep one known-good previous ref available for immediate rollback.

## Pre-Deploy

1. Confirm health baseline:
   `curl -sf http://localhost:8375/health/ready`
2. Capture current deployed ref:
   `git rev-parse --short HEAD`
3. Identify rollback target (last known-good tag/SHA).

## Rollback Plan (Dry Run)

```bash
scripts/rollback_to_ref.sh <target_ref>
```

This prints the exact rollback commands without changing state.

## Execute Rollback

```bash
scripts/rollback_to_ref.sh <target_ref> --execute
```

Execute mode includes:

- `git checkout <target_ref>`
- `docker compose -f compose.yml -f compose.prod.yml up -d --build`
- readiness verification via `/health/ready`
- automatic fallback to the prior ref if readiness fails

## Post-Rollback Verification

1. Health:
   `curl -sf http://localhost:8375/health/ready`
2. Critical API smoke:
   - auth login
   - feed read
   - chat send
3. Confirm error rates and latency trends in monitoring.

## Notes

- Execute mode requires a clean git worktree.
- Prefer releasing from tags in production (`vYYYY.MM.DD-N`) to simplify target selection.
