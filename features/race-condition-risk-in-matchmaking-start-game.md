# Race-Condition Risk In Matchmaking/Start Game

- [ ] Resolved

Matchmaking finds a waiting room outside a lock and then tries to join it.

Game creation also checks for an existing game before the insert transaction. The database constraint prevents duplicates, but concurrent requests can turn into errors instead of predictable behavior.
