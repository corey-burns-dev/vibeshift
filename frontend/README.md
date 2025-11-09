# Frontend (Vite + React + TanStack Query)

This is a minimal React + TypeScript frontend scaffolded with Vite and configured to proxy backend calls to `http://localhost:8080` for `/health` and `/ping` during development.

Quick start (from repo root):

```fish
cd frontend
npm install
npm run dev
```

The dev server runs at `http://localhost:5173` by default and proxies `/health` and `/ping` to the Go backend at `http://localhost:8080`.

Notes:
- The app includes `@tanstack/react-query` and a small example hook `useHealth` that fetches `/health`.
- If you prefer to use `yarn` or `pnpm`, adjust commands accordingly.

Developing with Docker Compose

If you prefer to develop inside containers and keep parity with CI, you can run the frontend from Compose so it starts after the backend and uses your local files:

```fish
# from repo root (docker-compose.override.yml is used automatically by docker-compose)
docker-compose up --build
```

The override mounts your local `frontend/` into the container and persists `node_modules` in a named volume so edits are reflected immediately.

The `frontend` container runs `npm ci` on start then `npm run dev` so the Vite dev server will be reachable at `http://localhost:5173`.

You can still run `npm run dev` locally in `frontend/` if you prefer not to use containers.

