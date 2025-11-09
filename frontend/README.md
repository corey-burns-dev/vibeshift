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

