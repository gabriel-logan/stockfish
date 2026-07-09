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

> To access from other devices on the same network, edit `docker-compose.yml`:
> ```yaml
> - VITE_BASE_URL_API=http://YOUR_IP:3000
> - VITE_BASE_URL_WS=ws://YOUR_IP:3000/ws
> ```
> Replace `YOUR_IP` with the host machine's local IP (e.g. `192.168.1.10`). Then rebuild:
> ```bash
> docker compose down && docker compose up -d --build
> ```

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

| Command | What it does |
|---------|--------------|
| `up -d` | Start containers in background |
| `up` | Start containers attached to terminal (live logs) |
| `up --build` | Rebuild images then start |
| `down` | Stop and remove containers and network |
| `down --rmi all -v` | Remove containers, images, and volumes |
| `logs -f` | Follow logs from all services |
| `restart` | Restart containers without rebuild |
