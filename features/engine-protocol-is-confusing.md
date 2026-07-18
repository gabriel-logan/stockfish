# Engine Protocol Is Confusing

- [ ] Resolved

In the engine WebSocket protocol, `setoption` reuses fields named `fen` and `moves` to represent the option name and value.

The contract works, but it is hard to read and easy to misuse.
