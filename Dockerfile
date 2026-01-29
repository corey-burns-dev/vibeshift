FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY backend/go.mod ./
RUN go mod download

COPY backend/ .
RUN go build -o main .

FROM alpine:3.21

RUN apk --no-cache add ca-certificates curl
WORKDIR /root/

COPY --from=builder /app/main .

ENV PORT=8375
EXPOSE 8375

CMD ["./main"]