# Hosted services and external integration

This guide explains how to use the engine and multiplayer API from another application, script, or website without using this project's web interface. The examples follow the contracts implemented in this repository.

| Service | Address | Availability |
| --- | --- | --- |
| Web interface | <https://stockfish-production-30ab.up.railway.app/play> | Visual chess application in a browser. |
| Engine | <https://stockfish-engine-production-be45.up.railway.app/> | Position analysis over HTTP and WebSocket. |
| Multiplayer API | **No public address** | **Turned off for financial reasons.** Accounts, rooms, matchmaking, online games, and saved games are unavailable on the hosted service. |

The web interface is not an API endpoint. Use the **engine** address for analysis. To integrate multiplayer, run your own **API** and PostgreSQL instances. The multiplayer examples below use `http://localhost:6090`; they do not refer to an active public service.

## Hosted engine

- HTTP base URL: `https://stockfish-engine-production-be45.up.railway.app`
- WebSocket URL: `wss://stockfish-engine-production-be45.up.railway.app/ws`

The current engine code does not require an account or token. It returns JSON and allows requests from other websites through CORS (`Access-Control-Allow-Origin: *`). Each HTTP request and WebSocket connection starts a Stockfish process, so choose reasonable search depths and line counts, and close connections you no longer need.

### Check availability

```bash
curl https://stockfish-engine-production-be45.up.railway.app/health
```

Response: `{"status":"ok"}`. The `/` path is not an analysis route; use `/analyze` or `/ws`.

### HTTP analysis: `POST /analyze`

Send `Content-Type: application/json`. The request returns when the search finishes or after the server's internal five-minute limit. Set your HTTP client's timeout accordingly.

```bash
curl -sS https://stockfish-engine-production-be45.up.railway.app/analyze \
  -H 'Content-Type: application/json' \
  -d '{"fen":"startpos","moves":"e2e4 e7e5","depth":12,"multi_pv":2}'
```

| Field | Type | Description |
| --- | --- | --- |
| `fen` | string | `"startpos"` or a complete FEN. Missing or empty uses the starting position. |
| `moves` | string | Space-separated UCI moves applied **after** the position in `fen`, such as `"e2e4 e7e5"`. This is neither an array nor PGN. |
| `depth` | integer | Search depth. Missing, zero, or negative uses `20`. |
| `multi_pv` | integer | Number of requested variations. Missing, zero, or negative uses `1`. |
| `elo` | integer | Optional. A positive value enables the UCI options `UCI_LimitStrength` and `UCI_Elo`. Without it, the engine does not apply this strength limit. |

Example with a complete FEN and limited strength:

```bash
curl -sS https://stockfish-engine-production-be45.up.railway.app/analyze \
  -H 'Content-Type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","depth":10,"elo":1600}'
```

Response shape (illustrative values):

```json
{
  "bestmove": "g1f3",
  "ponder": "b8c6",
  "analysis": [
    {
      "type": "analysis",
      "depth": 12,
      "seldepth": 18,
      "multi_pv": 1,
      "score": 0.32,
      "pv": ["g1f3", "b8c6"],
      "nodes": 123456,
      "nps": 250000,
      "time_ms": 493
    }
  ]
}
```

`bestmove` and `ponder` are UCI moves and may be absent if the engine does not provide them. `analysis` contains the updates received throughout the search, **not just the final evaluation**. For the final evaluation of each variation, use the last message for each `multi_pv`. In a mating position, a message may contain `mate` (distance in moves) instead of `score`. `score` is measured in pawns, converted from the centipawns in UCI output; its sign is relative to the side to move. To always display the score from White's perspective, invert its sign when Black is to move. Unavailable fields are omitted.

Invalid JSON returns HTTP `400`; failures to start or command the engine return HTTP `500`. Engine error bodies are plain text, even when the text resembles JSON. Do not assume that error responses contain valid JSON.

### Continuous analysis: `GET /ws`

Connect to `wss://stockfish-engine-production-be45.up.railway.app/ws`. The server sends **binary WebSocket frames containing UTF-8 JSON**. Clients may send JSON in text or binary frames. This is not a raw UCI connection; use the messages below.

1. Wait for `{"type":"ready"}`.
2. Send `{"type":"start","fen":"startpos","moves":"e2e4","depth":12,"multi_pv":2}`.
3. Read `analysis` messages until you receive `bestmove`.
4. To interrupt an active search, send `{"type":"stop"}`. The client does not receive the interrupted search's `bestmove`.

In `start`, `moves` is optional and uses the same UCI format as HTTP. A missing, zero, or negative `depth` becomes `1`; a missing, zero, or negative `multi_pv` becomes `1`. Sending another `start` replaces the previous search. The optional `{"type":"setoption","fen":"UCI_Elo","moves":"1600"}` message configures a UCI option: **only in this message**, `fen` is the option name and `moves` is its value. For example, first send `{"type":"setoption","fen":"UCI_LimitStrength","moves":"true"}` to enable limited strength.

Server messages:

| `type` | Relevant fields | Meaning |
| --- | --- | --- |
| `ready` | — | Engine ready for commands. |
| `analysis` | `depth`, `seldepth`, `multi_pv`, `score` or `mate`, `pv`, `nodes`, `nps`, `time_ms` | Partial search update; `pv` contains UCI moves. |
| `bestmove` | `bestmove`, optional `ponder` | Search completed. |
| `error` | `error` | Engine initialization failed. |

Minimal browser example:

```js
const socket = new WebSocket(
  "wss://stockfish-engine-production-be45.up.railway.app/ws",
);

socket.addEventListener("message", async (event) => {
  const payload = event.data instanceof Blob
    ? await event.data.text()
    : event.data;
  const message = JSON.parse(payload);

  if (message.type === "ready") {
    socket.send(JSON.stringify({
      type: "start",
      fen: "startpos",
      depth: 12,
      multi_pv: 1,
    }));
  }

  if (message.type === "analysis") {
    console.log("Partial evaluation:", message);
  }

  if (message.type === "bestmove") {
    console.log("Best move:", message.bestmove);
    socket.close();
  }
});
```

The server periodically sends WebSocket ping frames. Browser WebSocket implementations reply automatically; in clients that expose ping/pong handling, keep those replies enabled.

## Multiplayer API: contract for a self-hosted instance

**The hosted API is turned off for financial reasons and has no public URL.** None of the examples below work against the web interface or engine addresses. To run your own instance, see [api/README.md](api/README.md) and the Docker Compose instructions in [README.md](README.md). The default local instance listens at `http://localhost:6090`, with WebSocket at `ws://localhost:6090/ws`. Use `https://` and `wss://` when hosting under an HTTPS domain.

### Authentication

`POST /auth/register` accepts `{"username":"alice","email":"alice@example.com","password":"strong-password"}`. Usernames must be 3–32 characters long, and passwords must contain at least eight characters. `POST /auth/login` accepts `email` and `password`. Both return a `user` object plus `accessToken` and `refreshToken` fields (in **camelCase**).

```bash
curl -sS http://localhost:6090/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"strong-password"}'
```

Send the access token as `Authorization: Bearer <accessToken>` on protected routes. When it expires, `POST /auth/refresh` with `{"refreshToken":"..."}` returns new tokens and revokes the previous refresh token. `POST /auth/logout` accepts the same body format and revokes the refresh token. Store refresh tokens securely. The default access token lifetime is 900 seconds; the refresh token lifetime is 2,592,000 seconds. `GET /me` returns the authenticated user.

### HTTP routes

Use JSON for request bodies. Room, game, and saved game IDs are UUIDs. Entity responses use **camelCase**; WebSocket messages use **snake_case**.

| Method and route | Authentication | Request / response |
| --- | --- | --- |
| `GET /health` | No | `{"ok":true}`. |
| `POST /auth/register` | No | `username`, `email`, `password` → `user`, `accessToken`, `refreshToken`. |
| `POST /auth/login` | No | `email`, `password` → the same session fields. |
| `POST /auth/refresh` | No | `refreshToken` → new session. |
| `POST /auth/logout` | No | `refreshToken` → `{"ok":true}`. |
| `GET /me` | Yes | User data (`id`, `username`, `email`, `rating`, `createdAt`). |
| `POST /rooms` | Yes | `visibility` (`public` or `private`), `rated`, `timeControlSeconds`, `incrementSeconds` → room. All are optional; defaults are `public`, `false`, `600`, and `0`. Time control: 60–10,800 s; increment: 0–60 s. |
| `GET /rooms` | No | Up to 100 public rooms waiting for an opponent. |
| `GET /rooms/{roomId}` | No | Room by ID, including a private room if its ID is known. |
| `POST /rooms/{roomId}/join` | Yes | No body → `{ "room": ..., "game": ... }` when the game starts; `game` may be absent. |
| `POST /matchmaking/join` | Yes | Optional `rated`, `timeControlSeconds`, `incrementSeconds` → `matched`, `room`, and `game` if a match was found. Searches public rooms with matching options; otherwise creates one. |
| `POST /matchmaking/leave` | Yes | No body → `{"ok":true}`; cancels the user's waiting rooms. |
| `GET /games/{gameId}` | Yes, game player | `{ "game": ..., "moves": [...], "serverTime": ... }`. |
| `POST /games/{gameId}/resign` | Yes, game player | No body → updated game. |
| `GET /saved-games` | Yes | The user's saved games. |
| `POST /saved-games` | Yes | Required: `pgn`, `result`, `opponent`, `playerColor` (`w`/`b`), `moves`. Optional: `name`, `opening`, `botElo`. Returns the saved game. |
| `PATCH /saved-games/{savedGameId}` | Yes, owner | `{"name":"New name"}` → updated saved game; `null` clears the name. |
| `DELETE /saved-games/{savedGameId}` | Yes, owner | `{"ok":true}`. |

Matchmaking example using a token obtained from login or registration:

```bash
API_BASE=http://localhost:6090
ACCESS_TOKEN='PASTE_YOUR_ACCESS_TOKEN_HERE'

curl -sS "$API_BASE/matchmaking/join" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"rated":false,"timeControlSeconds":600,"incrementSeconds":0}'
```

If `matched` is `false`, follow the room over WebSocket. When another player joins, `game_started` provides the game ID. For a private room, create it with `visibility: "private"`, share its `room.id`, and have the other player call `/rooms/{roomId}/join`.

You can save a game independently of an online game:

```bash
curl -sS "$API_BASE/saved-games" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"pgn":"1. e4 e5 2. Nf3","result":"*","opponent":"Friend","playerColor":"w","moves":3}'
```

### Real-time games: `GET /ws?token=<accessToken>`

Connect to **your API instance's** WebSocket using an access token in the query string. The API accepts and sends **binary frames containing UTF-8 JSON**; text frames sent by the client are ignored. Avoid logging the full URL because it contains the token.

After `{"type":"ready","user_id":"..."}`, send binary messages in one of these formats:

```text
{"type":"join_room","room_id":"ROOM_UUID"}
{"type":"join_game","game_id":"GAME_UUID"}
{"type":"move","game_id":"GAME_UUID","uci":"e2e4"}
{"type":"offer_draw","game_id":"GAME_UUID"}
{"type":"accept_draw","game_id":"GAME_UUID"}
{"type":"decline_draw","game_id":"GAME_UUID"}
{"type":"request_rematch","game_id":"GAME_UUID"}
{"type":"accept_rematch","game_id":"GAME_UUID"}
{"type":"decline_rematch","game_id":"GAME_UUID"}
{"type":"ping"}
```

Each line above is a **separate message**, not one JSON document. Use UCI moves such as `e2e4` and `e7e8q` (promotion). `join_room` delivers `room_updated`, followed by `game_started` when the room becomes a game. `join_game` delivers `game_state` with `game`, `moves`, `white_player`, `black_player`, and `server_time`. A valid move produces `move_accepted` with `game` and `move_record`. Other possible events are `draw_offered`, `draw_offer_declined`, `rematch_requested`, `rematch_declined`, `player_disconnected`, `error` (with `message`), and `pong`. Player details in `game_state` and `move_accepted` can be `null`. Draw offers and rematch requests expire after 30 seconds.

Browser example after obtaining a token and room ID over HTTP:

```js
const socket = new WebSocket(`ws://localhost:6090/ws?token=${encodeURIComponent(accessToken)}`);
socket.binaryType = "arraybuffer";

socket.addEventListener("message", (event) => {
  const message = JSON.parse(new TextDecoder().decode(event.data));

  if (message.type === "ready") {
    const payload = JSON.stringify({ type: "join_room", room_id: roomId });
    socket.send(new TextEncoder().encode(payload));
  }

  if (message.type === "game_started") {
    const payload = JSON.stringify({ type: "join_game", game_id: message.game.id });
    socket.send(new TextEncoder().encode(payload));
  }

  console.log(message);
});
```

To play, send `move` after `join_game`. If a player disconnects during a game, the server may end it due to disconnection. Handle reconnection and the state returned by `GET /games/{gameId}` as appropriate for your client.

### Errors and browser integration

API HTTP errors use `{"error":"message"}`. The server uses, among others, `400` for invalid input, `401` for missing or invalid authentication, `403` for forbidden access, `404` for missing resources, and `500` for internal failures. WebSocket error events use `{"type":"error","message":"..."}`.

On your own instance, set `CORS_ALLOWED_ORIGINS` to the allowed website origins (comma-separated); the local default is `*`. CORS applies to browsers and does not replace authentication. For public integration, host your API instance with HTTPS/WSS and configure your own `JWT_SECRET` and PostgreSQL database.
