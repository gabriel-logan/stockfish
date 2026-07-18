# Contracts Are Too Stringly Typed

- [ ] Resolved

Status, result, visibility, and game side are handled as `String` in Rust and `string` in TypeScript.

This lets invalid values survive until runtime and makes the API/frontend contract harder to maintain.
