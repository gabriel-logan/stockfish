# Frontend Files Have Too Many Responsibilities

- [ ] Resolved

`PlayBoard.tsx`, `PgnViewer.tsx`, and `Board.tsx` concentrate game state, game rules, engine orchestration, move classification, PGN handling, persistence, board input, and UI.

This makes maintenance, testing, and future changes harder.
