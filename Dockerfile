ARG GO_VERSION=1.26.0-alpine3.23
ARG ALPINE_VERSION=3.23

FROM golang:${GO_VERSION} AS builder

RUN apk add --no-cache build-base libwebp-dev

WORKDIR /app

COPY backend/go.mod backend/go.sum* ./
RUN go mod download

COPY backend/ .
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o main ./cmd/server && \
    mkdir -p /tmp/sanctum/uploads && \
    chmod -R 0775 /tmp/sanctum

FROM alpine:${ALPINE_VERSION}

RUN apk add --no-cache libwebp ca-certificates && \
    adduser -D -u 10001 nonroot

WORKDIR /

COPY --from=builder /app/main .
COPY --from=builder /app/*.yml ./
COPY --from=builder --chown=nonroot:nonroot /tmp/sanctum /tmp/sanctum

USER nonroot:nonroot

EXPOSE 8375

ENTRYPOINT ["/main"]
