# Use a current Go toolchain. go.mod asks for 1.26.
FROM golang:1.26-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget su-exec \
    && adduser -D -u 1001 app

WORKDIR /app
COPY --from=build /out/server /app/server
COPY templates ./templates
COPY public ./public
COPY pixel-bg.svg 9nlGN0.gif ./
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
    && mkdir -p /app/data \
    && chown -R app:app /app

ENV PORT=80 \
    DATA_DIR=/app/data

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/healthz

ENTRYPOINT ["/docker-entrypoint.sh"]
