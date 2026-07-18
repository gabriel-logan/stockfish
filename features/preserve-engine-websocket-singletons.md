# Preserve Engine WebSocket Singletons

- [ ] Pending

Currently, the engine WebSocket connections are owned by `PlayBoard`. Every time the user leaves and returns to `/play` or `/free-play`, the component unmounts, closes the current sockets, mounts again, and creates new engine WebSocket connections.

Each engine WebSocket also creates a separate Stockfish process on the engine server, so route navigation causes unnecessary connection and process churn.

## Goal

Move engine WebSocket ownership out of route-level components and into a global `web/src/lib/wsInstance.ts` module.

The module should expose persistent singleton engine instances for the two current engine roles:

- `playEngine`: used for bot move calculation and Elo-limited play.
- `evalEngine`: used for full-strength evaluation, evaluation bar updates, and move classification.

Route components should reuse these instances instead of constructing new `AnalysisEngine` objects on every mount.

## Expected Behavior

Changing routes should not recreate the engine WebSocket connections when the existing global instances are still usable.

When a route unmounts, it should stop active analysis and clear route-specific callbacks, but it should not close the shared WebSocket connection by default.

The shared engines should only disconnect for explicit lifecycle reasons, such as application shutdown, a future idle timeout policy, or unrecoverable connection failure.

## Non-Goals

Do not collapse `playEngine` and `evalEngine` into one shared connection. They serve different engine states: limited-strength play and full-strength evaluation.

Do not make the online multiplayer API WebSocket global as part of this migration. Online sockets should remain scoped to matchmaking, room, or game participation.
