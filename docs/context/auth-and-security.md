# Auth and Security Patterns

## Auth Boundaries

- Enforce authentication for protected routes.
- Enforce authorization for user-owned resources.
- Never trust client-provided ownership claims.

## Token Handling

- Do not log auth tokens or secrets.
- Keep token handling aligned with backend validation and revocation model.

## Secret Management

- No hardcoded credentials or fallback production secrets.
- Validate required security-sensitive config at startup.

## Abuse Controls

- Rate limit sensitive endpoints.
- Apply abuse controls to realtime and moderation paths.

## Validation Checklist

- Protected endpoints include auth middleware.
- Sensitive operations include authorization checks.
- No secret material appears in logs or responses.
