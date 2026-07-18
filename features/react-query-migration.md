# React Query Migration

- [ ] Resolved

Currently, the frontend manages server state manually using `useEffect`, local loading flags, explicit `try/catch` blocks, direct service calls, and *ad hoc* cache updates within components.

This makes it difficult to maintain consistency in API-dependent flows—particularly in scenarios such as saved games, online lobbies, game loading, matchmaking actions, side effects from authentication renewal, and health checks.

## Goal

Migrate API-related state and mutations to React Query so that components no longer have to manually manage request lifecycles.

All HTTP-related operations should now be managed by React Query (With the exception of WebSockets, of course); remove all existing manual workarounds to make the code much cleaner and more organized.

Separate the queries folder from the mutations folder.
