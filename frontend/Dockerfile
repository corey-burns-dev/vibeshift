### production Dockerfile for frontend (build static files and serve with nginx)
ARG BUN_ALPINE_TAG=1.3.9-alpine
FROM oven/bun:${BUN_ALPINE_TAG} AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY index.html ./
RUN bun --bun run build

ARG NGINX_VERSION=1.28.2-alpine3.23
FROM nginx:${NGINX_VERSION} AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
