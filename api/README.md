# api

Rust multiplayer chess server for online games.

## Stack

- Actix Web HTTP API
- Actix WebSocket transport with `actix-ws`
- PostgreSQL persistence
- Atlas declarative schema management from `db/schema.sql`
- JWT bearer authentication with access and refresh tokens
- Server-side move validation with `shakmaty`

## Services

When started from the repository root:

```bash
docker compose up -d --build api-db
docker compose run --rm atlas schema apply --env local --auto-approve
docker compose up -d --build api
```

API URL: `http://localhost:6090`

PostgreSQL URL inside Compose:

```text
postgres://stockfish:stockfish@api-db:5432/stockfish_api
```

Atlas uses `api-dev-db` as its clean development database while computing declarative diffs. That service is behind the `tools` profile and is not exposed on a host port.

## Environment

| Name | Default | Description |
|------|---------|-------------|
| `HOST` | `0.0.0.0` | HTTP bind host |
| `PORT` | `6090` | HTTP bind port |
| `DATABASE_URL` | required | PostgreSQL connection URL |
| `JWT_SECRET` | required | HS256 signing secret |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Refresh token lifetime |
| `CORS_ALLOWED_ORIGINS` | `*` | Comma-separated browser origins allowed by CORS |

## HTTP API

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`

### Rooms and Matchmaking

- `POST /rooms`
- `GET /rooms`
- `GET /rooms/{roomId}`
- `POST /rooms/{roomId}/join`
- `POST /matchmaking/join`
- `POST /matchmaking/leave`

### Games

- `GET /games/{gameId}`
- `POST /games/{gameId}/resign`

## WebSocket

Connect with a token:

```text
ws://localhost:6090/ws?token=<accessToken>
```

Client messages:

```json
{"type":"join_room","roomId":"..."}
{"type":"join_game","gameId":"..."}
{"type":"move","gameId":"...","uci":"e2e4"}
{"type":"ping"}
```

Server messages:

```json
{"type":"ready","userId":"..."}
{"type":"room_updated","room":{}}
{"type":"game_started","game":{}}
{"type":"game_state","game":{},"moves":[]}
{"type":"move_accepted","game":{},"move":{}}
{"type":"error","message":"..."}
{"type":"pong"}
```

## Validation

Use Docker if Rust is not installed on the host:

```bash
docker run --rm -v "$PWD/api:/app" -w /app rust:1.95-bookworm cargo fmt --all -- --check
docker run --rm -v "$PWD/api:/app" -w /app rust:1.95-bookworm cargo clippy --workspace --all-targets --all-features -- -D warnings
docker run --rm -v "$PWD/api:/app" -w /app rust:1.95-bookworm cargo build --workspace --all-features
```
