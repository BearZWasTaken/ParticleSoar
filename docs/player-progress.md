# Player Progress

The current offline build stores progression in browser `localStorage` under
`particlesoar.player-progress.v1`.

The stored payload contains stable song ids, per-chart clear history, best
scores, and the unlocked song id set. Chapter links are evaluated from the
content catalog instead of being copied into the save, so changing a chapter
layout does not require migrating every player save.

`LocalPlayerProgressStore` uses asynchronous methods even though local storage
is synchronous. A future account-backed implementation can therefore expose
the same `load`, `save`, `recordClear`, and `applyChapterUnlocks` methods without
changing the chapter UI or game completion flow.

Local progress is device- and browser-specific. Clearing site data removes it,
and players can edit it through browser tools. It is suitable for offline
unlocks and prototyping, but it must not be treated as authoritative for public
leaderboards or rewards. A server version should verify play results and then
return the canonical progress snapshot.
