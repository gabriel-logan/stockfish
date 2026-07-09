# stockfish

**Analyze any chess position with the Stockfish engine — via REST, real-time WebSocket, or a polished web interface.**

A complete platform that exposes Stockfish's power through a Go engine server and a React frontend. Perfect for training, game analysis, or integrating chess analysis into your own projects.

## Packages

| Package | Description |
|---------|-------------|
| [engine](engine/README.md) | Go HTTP server, REST + WebSocket, Docker |
| [web](web/README.md) | React + TypeScript frontend |

## Development

See each package's README for setup instructions.

## Docker Compose

The whole stack runs with a single command. No need to install Go, Node, or Stockfish locally.

The engine uses its own [Dockerfile](engine/Dockerfile). The frontend runs directly from the `node:22` image using Vite's preview server — no Dockerfile needed in `web/`.

```bash
# Start in background
docker compose up -d

# Start and see logs in terminal
docker compose up

# Rebuild images before starting (after changes)
docker compose up --build -d
```

- **Engine** → `http://localhost:3000` (REST + WebSocket)
- **Web** → `http://localhost:5173`

> To access from other devices on the same network, set `HOST_IP` before running:
> ```bash
> export HOST_IP=192.168.100.3
> docker compose up -d --build
> ```
> Or inline:
> ```bash
> HOST_IP=192.168.100.3 docker compose up -d --build
> ```
> Defaults to `localhost` when `HOST_IP` is not set.

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
