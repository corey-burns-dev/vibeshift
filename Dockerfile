ARG GO_VERSION=1.25.7-alpine3.23
FROM golang:${GO_VERSION} AS builder

WORKDIR /app

COPY backend/go.mod backend/go.sum* ./
RUN go mod download

COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o main ./cmd/server

ARG DISTROLESS_IMAGE=gcr.io/distroless/static-debian12@sha256:cd64bec9cec257044ce3a8dd3620cf83b387920100332f2b041f19c4d2febf93
FROM ${DISTROLESS_IMAGE}

WORKDIR /

COPY --from=builder /app/main .

USER nonroot:nonroot

EXPOSE 8375

ENTRYPOINT ["/main"]
