# Cheese Thief (digital)

A private, mobile-first web version of the social deduction game *Cheese Thief*
(designed by Dongxu Li) for 4-8 friends, one phone each.

- Rules reference: [RULES.md](RULES.md) (owner decisions in §11)
- Plan: [PLAN.md](PLAN.md)

## Status
Milestone 3 of 6: lobby, role reveal and the full night (narration, timers, per-player
views). The discussion, vote and results screens arrive in Milestone 4; until then the
day phases show your private night notes and run on their timers.

## Run it locally
Requires Node 20 or newer.

```sh
npm install
npm run dev        # http://localhost:3000 (restarts on file changes)
```

To play from phones on the same Wi-Fi, open `http://<your-computer's-LAN-IP>:3000`.
Solo testing: create a room, then tap "Add a bot" three times. To be several players on
one computer, open tabs with `?debug=1&seat=1`, `?debug=1&seat=2`, ... (each tab gets its
own seat).

Fast solo test: open `http://localhost:3000/?debug=1`, create a room, add 3 bots, open
**Game settings** and tap **Fast timers**, then start.

Environment variables: `PORT` (default 3000), `ENABLE_BOTS=false` to hide bots,
`LOG_LEVEL=debug` for room logs, `TIME_SCALE=0.2` (debugging only) to run every timer
five times faster.

## Run the tests

```sh
npm test
```
