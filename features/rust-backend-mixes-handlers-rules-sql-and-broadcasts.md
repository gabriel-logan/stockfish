# Rust Backend Mixes Handlers, Rules, SQL, And Broadcasts

- [ ] Resolved

`rooms.rs` and `games.rs` handle HTTP, validation, SQL, domain rules, and WebSocket messages in the same modules.

This keeps flows tightly coupled and makes future changes riskier.
