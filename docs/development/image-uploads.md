# Image uploads (dev vs prod)

This file explains how media files are handled in development and production and how to avoid 404s when working locally.

- Backend serves images at `/media/i/<hash>/...` using the configured `IMAGE_UPLOAD_DIR`.
- In production, `nginx` is configured to alias `/media/i/` to `/var/sanctum/uploads/images`.
- In development the backend default is `/tmp/sanctum/uploads/images` to avoid requiring elevated perms.

Recommended local setup (fast):

1. Ensure the backend is running locally (e.g. `make dev` or running the API binary).
2. The frontend dev server (`vite`) proxies `/media` to the backend on `http://localhost:8375`.
   - This repository's `frontend/vite.config.ts` is configured to proxy `/media` to `http://localhost:8375` for local development.
3. Create the dev upload directory if it does not exist:

```bash
sudo mkdir -p /tmp/sanctum/uploads/images
sudo chown $(id -u):$(id -g) /tmp/sanctum/uploads/images
chmod 0750 /tmp/sanctum/uploads/images
```

4. To use a different path locally, set `IMAGE_UPLOAD_DIR` in your `.env` or in `backend/config.yml` (or the env file used by your local setup). Example `.env` entry:

```
IMAGE_UPLOAD_DIR=/tmp/sanctum/uploads/images
```

Notes
- Production uses `/var/sanctum/uploads/images` and `nginx` expects that directory to exist and be readable by the nginx user. Do not change production paths without coordinating deployment.
- The backend now attempts to create the configured `IMAGE_UPLOAD_DIR` automatically when running in development to reduce missing-file errors.
- If you still see 404s for `/media/i/...` verify that the image hash directory contains `master.jpg` (e.g. `/tmp/sanctum/uploads/images/<hash>/master.jpg`).

Helpful commands

```bash
# Inspect a particular image
ls -l /tmp/sanctum/uploads/images/<hash>/master.jpg
# Check backend serves the file
curl -I http://localhost:8375/media/i/<hash>/master.jpg
```
