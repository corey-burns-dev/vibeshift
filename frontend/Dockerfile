### production Dockerfile for frontend (build static files and serve with nginx)
FROM node:20-bullseye-slim AS build
WORKDIR /app
# Install dependencies (cache-friendly) then copy source and build
COPY package.json package-lock.json* ./
RUN npm ci --silent --no-audit --progress=false

COPY tsconfig.json vite.config.ts ./
COPY index.html ./
COPY src ./src
RUN npm run build

# Use the non-Alpine nginx image (Debian-based) which often has fewer reported vulnerabilities
FROM nginx:1.26.1 AS runtime
# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Ensure files are world-readable (helps when running as non-root workers)
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- --tries=1 --timeout=2 http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
