# CI Runbook & Contributor Checklist

Quick steps to run locally before opening a PR. These mirror CI jobs and help ensure your PR passes checks.

- Format code:

```bash
make fmt
git add -A && git commit -m "chore: format" || true
```

- Run fast unit tests (fail-fast):

```bash
cd backend
go test ./... -short
```

- Run full backend tests (this matches CI `test-backend`):

```bash
make test-backend
```

- Lint:

```bash
make install-linter   # one-time
make lint
```

- Regenerate OpenAPI/Swagger (if you change API comments/annotations):

```bash
make swagger
# or
cd backend && $(go env GOPATH)/bin/swag init -g cmd/server/main.go --output ./docs
git add backend/docs/swagger.yaml
```

If swagger changes, include the updated `backend/docs/swagger.yaml` in your PR — CI will run an OpenAPI drift check.

Notes:
- CI now includes a fast `go test -short` job that runs early to fail fast on obvious test regressions.
- Nightly job: `Nightly Go Race Detector` runs `go test -race ./...` against a test Postgres and Redis.
- Dependabot is enabled for Actions and Go modules; review Dependabot PRs and test updates locally.

If CI fails on formatting or linting, fix locally and push; do not merge until checks are green.
