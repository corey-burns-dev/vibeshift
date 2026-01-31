FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY backend/go.mod backend/go.sum* ./
RUN go mod download

COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o main .

FROM alpine:3.21

RUN apk --no-cache add ca-certificates curl && \
    addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /home/appuser

COPY --from=builder /app/main .
RUN chown appuser:appgroup main

USER appuser

ENV PORT=8375
EXPOSE 8375

CMD ["./main"]