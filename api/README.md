# stockfish-api

Go HTTP server that wraps Stockfish engine analysis via REST and WebSocket.

## Quick Start (Docker)

```bash
# Build
docker build -t stockfish-api .

# Run (detached)
docker run -d \
  --name stockfish-api \
  -p 3000:3000 \
  stockfish-api

# Stop & remove
docker stop stockfish-api && docker rm stockfish-api
```
