ARG GO_VERSION=1.26.0-alpine3.23
ARG ALPINE_VERSION=3.23

# Stage: base — shared Go toolchain and dependencies
FROM golang:${GO_VERSION} AS base
RUN apk add --no-cache build-base libwebp-dev postgresql-client bash
WORKDIR /app/backend

# Stage: dev — air hot-reload for development
FROM base AS dev
RUN go install github.com/air-verse/air@latest
EXPOSE 8375
CMD ["air", "-c", ".air.toml"]

# Stage: test — test runner with race detection
FROM base AS test
ENV CGO_ENABLED=1
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
CMD ["go", "test", "-v", "./..."]

# Stage: build — compile production binary
FROM base AS build
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o /app/main ./cmd/server && \
    mkdir -p /tmp/sanctum/uploads && \
    chmod -R 0775 /tmp/sanctum

# Stage: production — minimal runtime image
FROM alpine:${ALPINE_VERSION} AS production
RUN apk add --no-cache libwebp ca-certificates && \
    adduser -D -u 10001 nonroot

WORKDIR /
COPY --from=build /app/main .
COPY --from=build /app/backend/*.yml ./
COPY --from=build --chown=nonroot:nonroot /tmp/sanctum /tmp/sanctum

USER nonroot:nonroot
EXPOSE 8375
ENTRYPOINT ["/main"]
