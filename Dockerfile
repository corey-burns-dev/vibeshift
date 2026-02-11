FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY backend/go.mod backend/go.sum* ./
RUN go mod download

COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o main ./cmd/server

FROM gcr.io/distroless/static-debian12

WORKDIR /

COPY --from=builder /app/main .

USER nonroot:nonroot

EXPOSE 8375

ENTRYPOINT ["/main"]