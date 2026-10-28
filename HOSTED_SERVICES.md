# Connecting to Stockfish services

Use this guide to call the Stockfish engine from your own application and to integrate the multiplayer API. It covers URLs, request bodies, response formats, authentication, live updates, and local setup.

## Choose the right address

| Service | Address | Use it for |
| --- | --- | --- |
| Web interface | [https://stockfish-production-30ab.up.railway.app/play](https://stockfish-production-30ab.up.railway.app/play) | Open the visual chess application in a browser. This is **not an API endpoint**. |
| Engine | [https://stockfish-engine-production-be45.up.railway.app/](https://stockfish-engine-production-be45.up.railway.app/) | Analyze positions through HTTP or WebSocket. |
| Multiplayer API | No public address | Accounts, rooms, matchmaking, online games, and saved games. |

> **Availability:** The multiplayer API has no public endpoint at present because its hosting is offline for financial reasons. In the examples below, **https://api.your-domain.example is a fictional placeholder**. It does not point to a running API. Replace it with the address of your own deployment, or use **http://localhost:6090** after [starting the API locally](#run-the-api-locally).

The engine and multiplayer API are separate services. Engine analysis does not require an account. The web interface lives at **/play**; features that need the multiplayer API will be unavailable while that API is offline.

## Engine: first request

Send JSON to the engine's **POST /analyze** endpoint:

~~~bash
curl --request POST \
  'https://stockfish-engine-production-be45.up.railway.app/analyze' \
  --header 'Content-Type: application/json' \
  --data '{"fen":"startpos","depth":12}'
~~~

The response contains a **bestmove** in UCI notation and an **analysis** array. For example, **e2e4** means move the piece on e2 to e4. Actual search results vary.

### Engine endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | /health | Returns a JSON health response: {"status":"ok"}. |
| POST | /analyze | Complete a search and return its best move and analysis updates. |
| WebSocket | /ws | Stream analysis while the search runs. |

Engine HTTP base URL: **https://stockfish-engine-production-be45.up.railway.app**. The root URL is a service address; add a path such as **/analyze** or **/ws**.

### POST /analyze request fields

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| fen | string | A FEN position, or "startpos" for the initial position. | "startpos" |
| depth | integer | Search depth in plies. | 20 if omitted, zero, or negative. |
| multi_pv | integer | Number of candidate lines to analyze. | 1 if omitted, zero, or negative. |
| moves | string | Space-separated UCI moves played from the specified position, such as "e2e4 e7e5". | No moves. |
| elo | integer | Request Stockfish's strength limit at this Elo value. | No strength limit when omitted, zero, or negative. |

Analyze a position after two moves and ask for three candidate lines:

~~~bash
curl --request POST \
  'https://stockfish-engine-production-be45.up.railway.app/analyze' \
  --header 'Content-Type: application/json' \
  --data '{"fen":"startpos","moves":"e2e4 e7e5","depth":15,"multi_pv":3}'
~~~

A full FEN can be supplied instead of **startpos**:

~~~json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "depth": 12
}
~~~

### Read the engine response

The following values are illustrative:

~~~json
{
  "bestmove": "e2e4",
  "ponder": "e7e5",
  "analysis": [
    {
      "type": "analysis",
      "depth": 12,
      "multi_pv": 1,
      "score": 0.32,
      "pv": ["e2e4", "e7e5"],
      "nodes": 123456,
      "nps": 1234567,
      "time_ms": 100
    }
  ]
}
~~~

| Field | Meaning |
| --- | --- |
| bestmove | Chosen move in UCI notation. It can be absent if no best move was produced. |
| ponder | Optional predicted opponent reply. |
| analysis | Search updates collected during the request; there may be many entries at different depths. |
| score | Evaluation in pawns, converted from Stockfish centipawns. |
| mate | Mate score when Stockfish reports a forced mate instead of a regular score. |
| pv | Principal variation, as an array of UCI moves. |
| depth, seldepth, multi_pv | Search depth, selective depth, and candidate line number. |
| nodes, nps, time_ms | Nodes searched, nodes per second, and elapsed milliseconds. |

Some fields are absent when Stockfish has not reported them. Deeper searches can take longer; the HTTP handler stops waiting after five minutes and returns the analysis collected so far.

For a browser application, use **fetch**:

~~~js
const response = await fetch(
  "https://stockfish-engine-production-be45.up.railway.app/analyze",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen: "startpos", depth: 12 }),
  },
);

if (!response.ok) {
  throw new Error("Engine request failed: " + response.status);
}

const result = await response.json();
console.log(result.bestmove, result.analysis);
~~~

The engine permits cross-origin browser requests. For a local engine, use **http://localhost:3000**.

### Stream engine analysis with WebSocket

Connect to **wss://stockfish-engine-production-be45.up.railway.app/ws**. The server sends a **ready** message, then accepts JSON commands. The main commands are:

~~~json
{"type":"start","fen":"startpos","moves":"e2e4 e7e5","depth":15,"multi_pv":2}
{"type":"stop"}
~~~

**start** begins a search; **stop** interrupts the active search. The server streams **analysis** messages and then a **bestmove** message. If the engine cannot start, it can send a message with type **error** and an **error** field. For a local engine, connect to **ws://localhost:3000/ws**.

The server sends JSON inside **binary WebSocket frames**. Browser clients receive those frames as **Blob** objects by default:

~~~js
const socket = new WebSocket(
  "wss://stockfish-engine-production-be45.up.railway.app/ws",
);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({ type: "start", fen: "startpos", depth: 12 }));
});

socket.addEventListener("message", async (event) => {
  const payload =
    typeof event.data === "string" ? event.data : await event.data.text();
  const message = JSON.parse(payload);

  if (message.type === "analysis") {
    console.log("Depth:", message.depth, "Score:", message.score);
  }

  if (message.type === "bestmove") {
    console.log("Best move:", message.bestmove);
    socket.close();
  }
});
~~~

The engine accepts JSON sent as either text or binary WebSocket frames.

## Multiplayer API: use your own deployment

The public multiplayer API is **offline**. The example address **https://api.your-domain.example** is intentionally fictional. Substitute **http://localhost:6090** or the base URL of an API instance you host.

This API uses JSON over HTTP, JWT access tokens for protected routes, PostgreSQL for storage, and WebSocket for live play. HTTP request bodies and returned room/game objects use **camelCase** fields. WebSocket commands and event fields use **snake_case**.

### HTTP endpoint reference

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | /health | None | Check the API server. |
| POST | /auth/register | None | Create an account and receive tokens. |
| POST | /auth/login | None | Sign in and receive tokens. |
| POST | /auth/refresh | Refresh token in JSON body | Exchange a refresh token for a new token pair. |
| POST | /auth/logout | Refresh token in JSON body | Revoke a refresh token. |
| GET | /me | Access token | Get the current user. |
| POST | /rooms | Access token | Create a room. |
| GET | /rooms | None | List public rooms waiting for a player. |
| GET | /rooms/{roomId} | None | Get a room by ID. |
| POST | /rooms/{roomId}/join | Access token | Join a room and possibly start a game. |
| POST | /matchmaking/join | Access token | Match with a compatible room or create a waiting one. |
| POST | /matchmaking/leave | Access token | Leave the waiting queue. |
| GET | /games/{gameId} | Access token; game participant | Get a game and its moves. |
| POST | /games/{gameId}/resign | Access token; game participant | Resign an active game. |
| GET | /saved-games | Access token | List your saved games. |
| POST | /saved-games | Access token | Save a game. |
| PATCH | /saved-games/{savedGameId} | Access token | Rename a saved game. |
| DELETE | /saved-games/{savedGameId} | Access token | Delete a saved game. |

### 1. Create an account or sign in

The following runnable commands use the **local** API because no public API endpoint exists:

~~~bash
curl --request POST 'http://localhost:6090/auth/register' \
  --header 'Content-Type: application/json' \
  --data '{"username":"alice","email":"alice@example.com","password":"example-password-123"}'
~~~

For an existing account:

~~~bash
curl --request POST 'http://localhost:6090/auth/login' \
  --header 'Content-Type: application/json' \
  --data '{"email":"alice@example.com","password":"example-password-123"}'
~~~

Each response contains **user**, **accessToken**, and **refreshToken**. A user object includes **id**, **username**, **email**, **rating**, and **createdAt**. By default, access tokens last 15 minutes and refresh tokens last 30 days. Username length must be 3–32 characters and passwords must have at least 8 characters.

### 2. Authenticate protected requests

Pass the access token as a Bearer token:

~~~bash
curl 'http://localhost:6090/me' \
  --header 'Authorization: Bearer YOUR_ACCESS_TOKEN'
~~~

To renew a session, send **{"refreshToken":"YOUR_REFRESH_TOKEN"}** to **POST /auth/refresh**. The response contains a new access token **and** a new refresh token; replace both stored tokens. Send the same body to **POST /auth/logout** to revoke the refresh token. Keep tokens private.

### 3. Create or join a room

Create a public, unrated room with 10 minutes per player and a 5-second increment:

~~~bash
curl --request POST 'http://localhost:6090/rooms' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  --data '{"visibility":"public","rated":false,"timeControlSeconds":600,"incrementSeconds":5}'
~~~

The response is a room object with an **id**. A room creator plays White; the player who joins plays Black. **visibility** is **public** or **private**. **timeControlSeconds** must be 60–10,800; **incrementSeconds** must be 0–60. Omitted settings default to public, unrated, 600 seconds, and no increment.

A second signed-in user calls **POST /rooms/{roomId}/join**. The response contains **room** and, if the game starts, **game**. The game's **id** is used for game endpoints and live events. **GET /rooms** lists only public waiting rooms.

For automatic pairing, call **POST /matchmaking/join** with a body such as:

~~~json
{"rated":false,"timeControlSeconds":600,"incrementSeconds":5}
~~~

Its response contains **matched: true** and a **game** if a suitable opponent is found; otherwise it contains **matched: false** and a waiting **room**. Call **POST /matchmaking/leave** to cancel your waiting room.

### 4. Get a game or save one

**GET /games/{gameId}** returns **game**, **moves**, and **serverTime**. A move record contains UCI notation (such as **e2e4**) and SAN notation (such as **e4**). Only a player in the game may access it. **POST /games/{gameId}/resign** ends an active game for the resigning player.

Save a PGN to your account:

~~~bash
curl --request POST 'http://localhost:6090/saved-games' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  --data '{"name":"Opening practice","pgn":"1. e4 e5 2. Nf3 Nc6 *","result":"*","opponent":"Stockfish","playerColor":"w","moves":4}'
~~~

**pgn**, **result**, and **opponent** must be nonempty. **playerColor** must be **w** or **b**, and **moves** must be zero or greater. Optional fields are **name**, **opening**, and **botElo**. Use **GET /saved-games** to list, **PATCH /saved-games/{savedGameId}** with **{"name":"New name"}** to rename, and **DELETE /saved-games/{savedGameId}** to delete.

### 5. Play live through WebSocket

Connect with an access token in the query string:

~~~text
ws://localhost:6090/ws?token=YOUR_ACCESS_TOKEN
wss://api.your-domain.example/ws?token=YOUR_ACCESS_TOKEN  (fictional example)
~~~

The server starts with **{"type":"ready","user_id":"..."}**. Unlike the engine, the multiplayer server processes client JSON only from **binary WebSocket frames**; text frames are ignored. It also sends JSON inside binary frames. In a browser, encode commands and decode incoming Blob data:

~~~js
const socket = new WebSocket(
  "ws://localhost:6090/ws?token=" + encodeURIComponent(accessToken),
);

socket.addEventListener("open", () => {
  const command = { type: "join_room", room_id: roomId };
  socket.send(new TextEncoder().encode(JSON.stringify(command)));
});

socket.addEventListener("message", async (event) => {
  const payload = await event.data.text();
  const message = JSON.parse(payload);
  console.log(message.type, message);
});
~~~

| Client command | Fields | Purpose |
| --- | --- | --- |
| join_room | room_id | Subscribe to room changes and game start. |
| join_game | game_id | Receive a game snapshot and future events; requires a game participant. |
| move | game_id, uci | Play a legal move, such as e2e4. |
| offer_draw, accept_draw, decline_draw | game_id | Offer or answer a draw. |
| request_rematch, accept_rematch, decline_rematch | game_id | Request or answer a rematch. |
| ping | None | Request a pong application message. |

Server events include **room_updated**, **game_started**, **game_state**, **move_accepted**, **draw_offered**, **draw_offer_declined**, **rematch_requested**, **rematch_declined**, **player_disconnected**, **error**, and **pong**. A **game_state** snapshot includes the game, move history, both players when available, and server time. A **move_accepted** event includes the move record. Draw offers and rematch requests expire after 30 seconds if unanswered.

A normal flow is: connect both players; subscribe to the room with **join_room**; after the game starts, subscribe with **join_game**; send **{"type":"move","game_id":"GAME_ID","uci":"e2e4"}** as a binary frame. Both game subscribers receive the accepted move.

### Errors and troubleshooting

The multiplayer API returns HTTP errors with an **error** key, for example **{"error":"authentication required"}**. Common statuses are **400** for invalid input, **401** for missing or invalid authentication, **403** for forbidden access, and **404** for an unknown resource. WebSocket command errors arrive as **{"type":"error","message":"..."}**.

A failed connection to **api.your-domain.example** is expected: it is a fictional placeholder. If a local API request cannot connect, check that Docker Compose is running and that the database schema was applied. If an engine request fails, check **GET /health** on the engine URL.

## Run the API locally

From the repository root, prepare PostgreSQL and apply the Atlas schema, then start the API and engine:

~~~bash
docker compose --profile tools up -d api-db api-dev-db
docker compose --profile tools run --rm atlas schema apply --env local --auto-approve
docker compose up -d --build api engine
~~~

Check both services:

~~~bash
curl http://localhost:6090/health
curl http://localhost:3000/health
~~~

Use the same paths and JSON payloads from this guide with the local base URLs. To run the complete application, start all services with **docker compose up -d --build** after applying the schema. See the [API README](api/README.md), [engine README](engine/README.md), and [main README](README.md) for setup details.
