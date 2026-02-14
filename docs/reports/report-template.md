# Task Report Template

Use this template for substantial agent/contributor tasks.

## Metadata

- Date: `YYYY-MM-DD`
- Branch:
- Author/Agent:
- Scope:

## Structured Signals

Required for new reports. Keep this block machine-parseable.

```json
{
  "Report-Version": "1.0",
  "Domains": ["docs"],
  "Lessons": [
    {
      "title": "Replace with concrete lesson title",
      "severity": "HIGH",
      "anti_pattern": "Describe the anti-pattern or failure mode",
      "detection": "rg -n \"pattern\" backend frontend",
      "prevention": "Describe guardrail/prevention pattern"
    }
  ]
}
```

Domain values: `backend`, `frontend`, `auth`, `websocket`, `db`, `redis`, `infra`, `docs`.
Severity values: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`.

## Summary

- What was requested.
- What was delivered.

## Changes Made

- Key implementation details.
- Key files touched.

## Validation

- Commands run:
- Test results:
- Manual verification:

## Risks and Regressions

- Known risks:
- Potential regressions:
- Mitigations:

## Follow-ups

- Remaining work:
- Recommended next steps:

## Rollback Notes

- How to revert safely if needed.
