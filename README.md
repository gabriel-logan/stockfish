# stockfish

**Analyze any chess position with the Stockfish engine — via REST API, real-time WebSocket, or a polished web interface.**

A complete platform that exposes Stockfish's power through a Go API and a React frontend. Perfect for training, game analysis, or integrating chess analysis into your own projects.

## Packages

| Package | Description |
|---------|-------------|
| [api](api/README.md) | Go HTTP server, REST + WebSocket, Docker |
| [web](web/README.md) | React + TypeScript frontend |

## Development

See each package's README for setup instructions.

## Docker Compose

The whole stack runs with a single command. No need to install Go, Node, or Stockfish locally.

```bash
docker compose up
```

- **API** → `http://localhost:3000` (REST + WebSocket)
- **Web** → `http://localhost:5173`

The API uses its own [Dockerfile](api/Dockerfile). The frontend runs directly from the `node:22` image using Vite's preview server — no Dockerfile needed in `web/`.

Rebuild after pulling changes:

```bash
docker compose up --build
```
