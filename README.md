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

The API uses its own [Dockerfile](api/Dockerfile). The frontend runs directly from the `node:22` image using Vite's preview server — no Dockerfile needed in `web/`.

```bash
# Start in background
docker compose up -d

# Start and see logs in terminal
docker compose up

# Rebuild images before starting (after changes)
docker compose up --build -d
```

- **API** → `http://localhost:3000` (REST + WebSocket)
- **Web** → `http://localhost:5173`

```bash
# Stop containers (keeps images)
docker compose down

# Stop and delete everything (images, volumes)
docker compose down --rmi all -v

# Follow logs from running containers
docker compose logs -f

# Rebuild a single service without touching the other
docker compose up -d --build web

# Restart containers
docker compose restart
```

| Command | O que faz |
|---------|-----------|
| `up -d` | Sobe os containers em background |
| `up` | Sobe os containers preso ao terminal (logs ao vivo) |
| `up --build` | Reconstrói as imagens e sobe |
| `down` | Para e remove containers e rede |
| `down --rmi all -v` | Remove containers, imagens e volumes |
| `logs -f` | Segue os logs de todos os serviços |
| `restart` | Reinicia os containers sem rebuildar |
