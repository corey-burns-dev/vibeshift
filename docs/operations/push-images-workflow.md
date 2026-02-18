# Push Images Workflow

Location: `.github/workflows/push-images.yml`

Purpose
-------
Builds and publishes Docker images for `backend`, `frontend`, and `playwright` to GitHub Container Registry (GHCR).

Triggering rules
-----------------
- Runs automatically after the `CI` workflow completes (`workflow_run`) — this ensures `latest` on `master`/`main` is only published when CI passes.
- Also triggers on push of tags matching `v*` (for release/versioned images).
- Supports manual runs via `workflow_dispatch`.

What it publishes
------------------
- `ghcr.io/<owner>/<repo>/backend:latest` and `:sha`
- `ghcr.io/<owner>/<repo>/frontend:latest` and `:sha`
- `ghcr.io/<owner>/<repo>/playwright:latest` and `:sha`

Security & safety notes
-----------------------
- The workflow logs into GHCR using the repo `GITHUB_TOKEN` and requires `packages: write` permission.
- Image pushes are gated to the `CI` workflow for branch pushes to avoid publishing broken artifacts as `latest`.
- The workflow will not run (and cannot access secrets) for untrusted fork PRs — this prevents leaking secrets.

How to push a release image (tagged)
------------------------------------
1. Create an annotated tag locally matching `vX.Y.Z`, e.g. `git tag -a v1.2.3 -m "release v1.2.3"`.
2. Push the tag: `git push origin v1.2.3`.
3. The tag push triggers `push-images` (and will publish images for that tag). If you want the tag to be gated by CI, create the tag from `master` after CI has passed, or run the workflow manually after CI.

Manual re-push (when needed)
-----------------------------
- Go to the Actions tab → `Push Docker Images` → `Run workflow`. Choose the branch/commit (or leave default) and run.

Cleanup interaction
-------------------
- There is a scheduled GHCR cleanup workflow (`.github/workflows/ghcr-cleanup.yml`) that deletes older versions but preserves `latest`.
- The cleanup script looks for package names `playwright frontend backend` — ensure those names remain in sync if you rename packages.

Extending / changing policy
---------------------------
- To only publish on tagged releases (no `latest`), update the workflow triggers to remove the `workflow_run` entry and only listen on `push.tags` and `workflow_dispatch`.
- To block publishing until additional checks pass, make those checks part of the `CI` workflow so `push-images` only runs after `CI` completes successfully.
