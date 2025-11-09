### production Dockerfile for frontend (build static files and serve with nginx)
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY index.html ./
RUN npm ci --silent && npm run build

FROM nginx:stable-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
