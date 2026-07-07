FROM golang:1.26.4-bookworm AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN GOOS=linux GOARCH=amd64 go build -o server .

FROM ubuntu:noble

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

RUN curl -L \
    https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-avx2.tar \
    -o /tmp/stockfish.tar && \
    tar -xf /tmp/stockfish.tar -C /tmp/ && \
    find /tmp -maxdepth 2 -type f \( -name "stockfish" -o -name "stockfish-*" \) | \
    head -1 | xargs -I {} mv {} /usr/local/bin/stockfish && \
    chmod +x /usr/local/bin/stockfish && \
    rm -rf /tmp/stockfish*

EXPOSE $PORT

COPY --from=builder /app/server /usr/local/bin/server

STOPSIGNAL SIGTERM

CMD ["server"]
