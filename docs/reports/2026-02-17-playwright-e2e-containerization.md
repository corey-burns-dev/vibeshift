---
title: Playwright E2E Containerization & CI Integration
date: 2026-02-17
author: automation
---

Summary
-------

This report documents the work done to containerize Playwright E2E tests, run them reliably on CI and developer machines, and configure caching and retention for the built images.

What changed
------------
- Added `frontend/Dockerfile.e2e` — Debian 13 slim image that installs Playwright system libraries and browsers.
- Added a helper script: `scripts/run-playwright-docker.sh` to build the image and run Playwright inside a container, saving artifacts to `frontend/reports/`.
- Added Make targets: `build-playwright-image` and `test-e2e-container` to build and run tests locally.
- Updated `scripts/run-e2e-smoke.sh` to fall back to running tests inside the `playwright` compose service if Bun is not present locally.
- Updated GitHub Actions:
  - `ci.yml`: builds the Playwright image during the docker-build job and pushes it (on push) in `push-images`.
  - `e2e-nightly.yml`: builds the Playwright image and runs the full E2E suite inside the container using host networking.
- Updated docs: `frontend/TESTING.md` to include Docker-based Playwright instructions.

How to run locally
-------------------

1. Preferred (host has Bun & Playwright):

```bash
# start backend and frontend as usual, then
make test-e2e
```

2. Containerized (host missing Bun or OS libs):

```bash
chmod +x ./scripts/run-playwright-docker.sh
./scripts/run-playwright-docker.sh --grep @smoke --workers=2
```

Artifacts (HTML report, traces, test-results) will be written to `frontend/reports/`.

CI caching & retention
----------------------

- CI uses `docker/build-push-action` with `cache-from: type=gha` and `cache-to: type=gha,mode=max` to speed up builds. This is enabled for backend, frontend and the new `playwright` image.
- To avoid GHCR/registry storage growth, a scheduled cleanup workflow has been added to prune old container package versions from GHCR (configurable retention days). See `.github/workflows/ghcr-cleanup.yml`.

Notes & follow-ups
------------------

- The CI runs the Playwright container with `--network host` so the container can reach services started on the runner (frontend/backend). This works on Linux runners. For macOS/Windows runners we can add a Compose-based path that uses exposed ports instead.
- If you want images pushed to a different registry or a different naming convention, update the workflow `push-images` job.
- We can extend `scripts/run-playwright-docker.sh` to collect traces/videos into a timestamped folder — tell me if you want that added.

Files changed
-------------

- frontend/Dockerfile.e2e
- scripts/run-playwright-docker.sh
- scripts/run-e2e-smoke.sh
- frontend/TESTING.md
- Makefile (added build/playwright targets)
- .github/workflows/ci.yml
- .github/workflows/e2e-nightly.yml
