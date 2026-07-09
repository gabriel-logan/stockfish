# stockfish-engine

Go HTTP server that wraps Stockfish engine analysis via REST and WebSocket.

## Quick Start (Docker)

```bash
# Build
docker build -t stockfish-engine .

# Run (detached)
docker run -d \
  --name stockfish-engine \
  -p 3000:3000 \
  stockfish-engine

# Stop & remove
docker stop stockfish-engine && docker rm stockfish-engine
```
