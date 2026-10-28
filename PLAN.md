# Cheese Thief (digital): Plan

Status: **approved by the owner** (with the rule decisions in §2), 2026-10-27.
All six milestones in §11 are built; see README.md and DEPLOY.md.

Source of truth for rules: [RULES.md](RULES.md), plus the owner's decisions recorded in
§2 for everything RULES.md tagged [UNKNOWN]. All rule switches live in one place in code
(`RULE_OPTIONS` in `game/rules.js`), each commented with the RULES.md section or the
owner decision it comes from.

---

## 1. Summary

- One Node 20+ process (Express + `ws`) serves the static client, `GET /healthz`, and the
  WebSocket game server at `/ws`. It runs as a single Render Web Service.
- The server is authoritative. Clients send *intents*. The server answers each player
  with *their own view*, built by one pure function `viewFor(game, playerId)`. The full
  state never leaves the server.
- All game rules live in `game/rules.js`: pure functions, no I/O, no timers, and an
  injected RNG so tests are deterministic.
- Client: vanilla ES modules, no build step, no framework.
- Dependencies: `express`, `ws`. Tests use the built-in `node:test` (no dev deps).

**Why `ws` rather than Socket.IO:** we only need one message channel per phone. Reconnect
is handled by our own seat tokens (Socket.IO's reconnect doesn't know about seats
anyway). Heartbeats are about 20 lines. Using `ws` keeps the payload exactly what the
leak tests inspect, with no extra framing and no long-polling fallback to secure.

---

## 2. Rule decisions (owner, 2026-10-27)

These settle every [UNKNOWN] in RULES.md. "Owner" means the project owner decided it for
this app.

| # | Question (RULES.md) | Decision | Source |
|---|---|---|---|
| Q1 | Follower rules, including 6-8 players (§5, §9.1) | **One Follower at every player count, 4-8, always chosen by the Thief after hour 6** (see Q4). No separate 6-8 rule. | Owner |
| Q2 | What players see when several share an hour without the Thief (§4) | They see each other (who is awake) and the cheese: still there if not yet stolen, gone if already stolen. Nobody can peek. | Owner |
| Q3 | Does a Thief awake alone get an extra action? (§4) | No. The Thief only steals. | Owner (approved plan) |
| Q4 | When is the Follower chosen and told? (§5) | **Nobody becomes a Follower during the hours**, even if exactly one Sleepyhead woke with the Thief. After hour 6 there is a short *Follower* step: the Thief must choose **any one Sleepyhead** (not only ones who woke with them). If time runs out, the server picks at random. Then a 5-second *Follower check*: everyone opens their eyes, and each phone says whether its player is the Follower (the Follower's also names the Thief), in the same layout for everyone. Then a 10-second silent *meet-up*: everyone else closes their eyes while the Thief and the Follower look at each other. | Owner (revised) |
| Q5 | Must the Thief take a Follower? (§5) | Yes, always exactly one (with 4+ players there are always at least 3 Sleepyheads). | Owner |
| Q6 | Ties (§7) | If the Thief is tied for the most votes, the Thief counts as caught and the **Sleepyheads win**. | Owner (approved plan) |
| Q7 | Self-votes, and can the Thief vote for their Follower? (§7) | No self-votes. Anyone else, the Follower included, can be voted for. | Owner (approved plan) |
| Q8 | Fall Guy / optional roles (§5) | Not in v1. | Owner (approved plan) |
| Q9 | Discussion time limit (§6) | A host-configurable timer, 3 minutes by default. The host can end it early. | Owner (approved plan) |

What players still see at the Thief's hour: every Sleepyhead awake then sees the Thief
take the cheese (they learn who the Thief is), and the Thief sees who is awake with them.
That is just being awake at the table (RULES.md §4). Who the Follower is stays secret
from everyone except the Thief and the Follower until the results.

Winners: if the Thief has the most votes (ties included, Q6), every Sleepyhead except the
Follower wins. Otherwise the Thief and the Follower win (RULES.md §7).

App decisions (approved):

| # | Decision | Proposal |
|---|---|---|
| D1 | Is the steal automatic? | On their hour the Thief taps "Take the cheese". If they don't, it happens automatically 5 s before the hour ends. Stealing is mandatory (RULES.md §4 "steals on the Thief's own hour"). |
| D2 | Peek | A lone Sleepyhead may peek at **one** other player's die and sees only the number, never the role. It is optional. |
| D3 | Timing | Every hour, the Follower step and the meet-up last exactly their set time, whatever anyone does. None of them ends early (no timing side channel). Defaults: hour 15 s, Follower choice 20 s, Follower check 5 s, meet-up 10 s. |
| D4 | Results screen | Reveals every role, every die, the Follower, every vote, and the winners. This mirrors flipping cards and pointing in the physical game. |
| D5 | Missing votes | A player who hasn't voted when the vote timer (default 45 s) runs out abstains. |
| D6 | Player disconnected during their hour | The game clock doesn't wait. A missed peek is skipped. A missed steal or Follower choice happens automatically (D1, Q4). |
| D7 | Cues that others could hear (see §8) | Narration and chimes are identical on every phone. There is **no** personal wake sound or vibration, because a buzzing phone on a table would reveal who is awake. Every phone gets the same short vibration at each step change, which tells you nothing about anyone. |
| D8 | Narrating phone | Speech plays on the host's phone by default (several phones talking slightly out of sync sounds bad). Any player can toggle "Narrate on this phone". Every phone always shows the narration text. |

---

## 3. Architecture

```
 phone (browser)                        Render Web Service (one Node process)
 ┌───────────────────┐   HTTPS GET     ┌──────────────────────────────────────┐
 │ index.html + ESM  │ ─────────────▶  │ Express: static /public, GET /healthz│
 │                   │   wss://…/ws    │ ws server (/ws)                      │
 │ net.js  ◀────────────────────────▶  │   RoomManager ── Room ── Room …      │
 │ screens/*.js      │  intents ▶      │     Room: seats, sockets, timers     │
 │ narrator.js       │  ◀ own view     │       └─ game/rules.js (pure)        │
 └───────────────────┘                 └──────────────────────────────────────┘
```

- **`game/rules.js`** (pure): `createGame`, `applyIntent`, `advance` (called when a
  timer fires), `viewFor`, `tallyVotes`, `winner`, and `RULE_OPTIONS`. Every function
  takes state and returns new state plus a list of *effects* (for example
  `{ notify: [playerIds] }`). It never touches sockets or the clock.
- **`server/room.js`**: owns one room. It holds the seats (name, token, socket,
  connected), the game state, and **the clock**: one `setTimeout` per phase step, with
  `endsAt` timestamps. On every state change it sends `viewFor(game, id)` only to the
  players named in the effect. Sleepers aren't told anything happened.
- **`server/rooms.js`**: creates room codes, looks rooms up, and sweeps for inactivity.
- **`server/index.js`**: Express plus the `ws` upgrade, heartbeat, `process.env.PORT`,
  bound to `0.0.0.0`.
- **`server/bots.js`**: server-side bot seats for solo testing (§10).

---

## 4. State machine

```
LOBBY ──start (host, 4..maxPlayers)──▶ ROLE_REVEAL
ROLE_REVEAL ──all confirmed or 45 s──▶ NIGHT_INTRO (8 s, "everyone close your eyes")
NIGHT_INTRO ─▶ HOUR(1) ─▶ HOUR(2) ─▶ … ─▶ HOUR(6)      each exactly hourMs (default 15 s)
HOUR(6) ─▶ FOLLOWER_CHOICE (20 s: Thief picks any Sleepyhead; random on timeout)
        ─▶ FOLLOWER_CHECK  (5 s: everyone looks; each phone says whether you're the
                            Follower, and the Follower's names the Thief)
        ─▶ FOLLOWER_MEET   (10 s: Thief and Follower look at each other; everyone else
                            has their eyes closed)
        ─▶ DAWN (5 s, "everyone wake up")
DAWN ─▶ DISCUSSION (default 180 s; host may end early) ─▶ VOTE (all voted or 45 s)
VOTE ─▶ RESULTS ──play again (host)──▶ LOBBY (same room, same seats, new deal)
```

Inside `HOUR(h)`, the server works out `awake = players whose die == h`:

- **Thief in `awake`**: the Thief's screen offers "Take the cheese" (D1). Once the
  cheese is taken, every other awake player's screen shows it being taken by the Thief.
  No Follower is chosen here (Q4).
- **`awake` is exactly one Sleepyhead**: they may peek at one die (D2).
- **Otherwise**: the awake players see each other and the cheese status (Q2).
- **Nobody awake**: the hour still runs its full length.
- The hour ends on the timer only, never early (D3).

Phase changes are sent to everyone, because everyone hears the narration anyway. What
happens *inside* an hour is sent only to the players awake in that hour. During
`FOLLOWER_CHOICE` only the Thief gets updates; nobody else learns whether or when a choice
was made. At the start of `FOLLOWER_CHECK` every player learns whether they are the
Follower; only the Follower learns who the Thief is.

---

## 5. Message protocol

All messages are JSON over one WebSocket: `{ "t": "<type>", ...fields }`. The server
accepts at most 2 KB per message (`maxPayload`). Every client message is validated
against an allowlist of types and fields; anything else gets an `error` reply and is
ignored.

### Client → server (intents)

| `t` | fields | when |
|---|---|---|
| `hello` | `token?`, `room?` | first message on every (re)connect; reclaims the seat if the token is valid |
| `create` | `name` | Home |
| `join` | `room`, `name` | Home / join link |
| `settings` | `settings: { hourSec?, followerChoiceSec?, discussionSec?, voteSec?, narratorOnHost? }` | host, lobby |
| `kick` | `playerId` | host, lobby |
| `addBot` / `removeBot` | `playerId?` | host, lobby, bots enabled (§10) |
| `start` | – | host, lobby |
| `revealed` | – | role reveal ("I've memorized it") |
| `steal` | – | Thief, own hour |
| `chooseFollower` | `playerId` | Thief, `FOLLOWER_CHOICE` step, any Sleepyhead |
| `peek` | `playerId` | lone Sleepyhead, own hour |
| `endDiscussion` | – | host |
| `vote` | `playerId` | vote phase; one vote, final once sent |
| `playAgain` | – | host, results |
| `leave` | – | any time |
| `ping` | – | every 20 s (app-level heartbeat) |

### Server → client

| `t` | content |
|---|---|
| `welcome` | `token`, `room`, `playerId`. Store the token. Sent only to that socket. |
| `view` | the full per-player view (below). Sent after every change *this player is entitled to see*. Reconnecting just means receiving a fresh `view`. |
| `error` | `code` (`ROOM_NOT_FOUND`, `GAME_IN_PROGRESS`, `NAME_TAKEN`, `ROOM_FULL`, `NOT_ALLOWED`, `BAD_MESSAGE`, `KICKED`, …) and `message` |
| `roomClosed` | `reason` (`expired`, `empty`, `serverRestart`) |
| `left` | confirms a `leave`; the client forgets its seat |
| `pong` | `serverNow` (also used to correct clock offset for timers) |

### The `view` object (the only place game data appears)

```js
{
  t: "view",
  serverNow, room: { code, hostId, settings },
  players: [{ id, name, connected, isBot, isHost, ready?, hasVoted? }],   // public only
  phase: { name, hour?, endsAt },                                          // public
  me: { id, role?, die? },                       // own secrets only, after the deal
  night: {                                       // only things THIS player saw
    awakeNow: bool,
    now?:  { companions: [ids], cheeseOnTable, thiefId?,
             canSteal?, canPeek?, peek?: { playerId, die } },
    notes: [{ hour, companions, cheeseOnTable, thiefId?, peek? }]
  },
  follower?: {                                   // absent for everyone else
    options?: [ids], chosenId?,                  // Thief, from FOLLOWER_CHOICE
    isYou?: true, thiefId?                       // the Follower, from FOLLOWER_CHECK
    isYou?: false                                // everyone else but the Thief, from FOLLOWER_CHECK
  },
  vote?:    { myVote?, votedIds },               // others' choices hidden until RESULTS
  results?: { roles, dice, followerId, votes, tally, thiefCaught, winners }
}
```

Player ids are random (not join order or role order), and the `players` list is sorted
by name (people first, then bots), so nothing can be read from ordering. During the night
(intro, hours, Follower steps) public changes such as someone reconnecting are held back
until the next phase change, so a phone waking up for its hour can't reveal who is awake. Seat tokens never appear in a `view`.

---

## 6. Hidden-information guarantees and leak tests

This is enforced in four layers:

1. **Construction.** The only data a client ever receives is `viewFor(game, me)` (plus
   `welcome`/`error`/`pong`, which carry no game data). `viewFor` builds the view from an
   allowlist; it never copies or filters a state object.
2. **Schema test.** Every message every socket receives is checked against a strict
   per-type key allowlist. An unexpected key fails the test, which catches fields added
   by accident later.
3. **Entitlement test.** The test runs full games (bots, every player count, many
   seeds, including the edge cases from RULES.md §10). It records every message per
   player, then walks each one. Every role, die, follower, vote or peek it finds is
   checked against what the rules say that player may know *at that moment*:
   - own role and die: from the deal onwards
   - other players' dice: only via a peek (that one die), or implied by sharing an
     hour (they appear in `companions`, not as a die value)
   - Thief's identity: only if awake at the Thief's hour, or in RESULTS
   - Follower identity: only the Thief (from their choice) and the Follower (from
     `FOLLOWER_CHECK`), or anyone in RESULTS; others only learn they are not it
   - other players' votes: only in RESULTS
   - other seats' tokens: never
4. **Indistinguishability tests.**
   - At any moment, two sleeping players' `night` and `phase` sections are
     byte-identical.
   - During the night, a sleeping player receives exactly the same sequence of message
     *types and timings* whatever the awake players do (steal early or late, peek or
     not, a Thief alone or with company).

The tests run against the real server over real WebSockets (`test/leak.test.js`), not
just `viewFor`.

---

## 7. Rooms, robustness, reconnect

- **Room code:** 4 letters from an unambiguous alphabet (no I, O, L), for example
  `KCFM`. The join link is `https://<host>/?r=KCFM`. The lobby has a Share/Copy button
  (`navigator.share` when available).
- **Seat token:** 128-bit random, issued in `welcome`, stored in `localStorage` under
  `cheese:<room>`. On reconnect, `hello {token, room}` reclaims the seat in any phase.
  A token for an unknown room gets `ROOM_NOT_FOUND`, and the client shows "Room expired,
  create a new one". This also covers redeploys and restarts, because rooms live in
  memory only.
- **Heartbeat:** the server sends a `ws` ping every 15 s and terminates the socket if no
  pong arrives within 30 s. The client sends an app `ping` every 20 s; if it gets no
  `pong` within 10 s it closes and reconnects. **Auto-reconnect** uses exponential
  backoff (0.5, 1, 2, 4, 8 s, then every 10 s, with jitter). It also reconnects right
  away on `visibilitychange` to visible and on `online`, which covers the phone waking
  from sleep.
- **Disconnects** never pause the game (D6). The player list shows a 💤/📵 "offline"
  badge in public, because the table can see that anyway.
- **Host migration:** if the host is offline for more than 20 s (any phase), host moves
  to the longest-seated connected human; a host who taps Leave mid-game hands over at
  once. If no humans are connected, the host stays and the room idles until it expires;
  the first player back takes over after the grace period. During the night the change
  is announced at the next step.
- **Lobby rules:** late joiners get `GAME_IN_PROGRESS` (seat reclaim by token still
  works). Names are 1-16 characters, trimmed, compared case-insensitively for
  duplicates (`NAME_TAKEN`), and always rendered with `textContent` (no HTML injection).
  The host can kick players in the lobby; a kicked seat's token is revoked. The room is
  capped at 8 players.
- **Expiry:** each room keeps `lastActivity`, updated on any intent and on the app
  pings from phones that have the room open. A sweep every 60 s deletes rooms idle for
  more than 30 minutes, sending `roomClosed {expired}` to any open sockets first. So a
  room expires about 30 minutes after the last phone closed or went to sleep.
- **Cold start (Render free tier):** the client shows "Waking up the mouse hole…" while
  the socket connects and keeps retrying. The first ever page load is served by the
  same sleeping service, so on that first load the browser spinner shows until the
  service is up. To cover returning players, a small service worker caches the app
  shell, so a returning visitor sees the wake-up screen immediately. (Static files are
  never stale for long: the worker is network-first for the shell.)
- **Transport:** the client builds the socket URL from `location`:
  `(location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'`. There
  is no hardcoded host.

---

## 8. UX

**Screens:** Connecting/"Waking up the mouse hole…", Home (create / join with code),
Lobby (players, share link, host controls, settings, bots), Role reveal, Night (asleep /
awake), Dawn, Discussion, Vote, Results, plus a "Room expired" / "Removed" notice.

- **Role reveal:** a hold-to-reveal card. Pressing and holding shows your role and your
  die; letting go hides it immediately. Then you tap "I've memorized it". The same
  hold-to-peek button stays available (small) during the night and day, for your own
  info only.
- **Night, asleep:** a near-black screen with a moon, "Eyes closed… it's 3 o'clock", and
  the hour timer. **Night, awake:** also dark (so screen glow doesn't stand out), with
  your hour, who else is awake, cheese on the table or gone, and action buttons (Steal /
  Choose follower / Peek), each at least 56 px tall. Night notes are kept for the day so
  you don't have to remember them.
- **Discussion:** timer, your private night notes, hold-to-peek. **Vote:** one big
  button per other player, then a confirmation, with "waiting for N players".
  **Results:** caught or not, who the Thief was, the Follower, the vote breakdown, all
  dice, winners, and a "Play again" button (host).
- **Narration:** Web Speech API (`speechSynthesis`), unlocked by the first tap (iOS
  needs a user gesture). The script is fixed text per step, for example "It's 3
  o'clock. If you rolled a 3, open your eyes." … "Close your eyes." There is a
  mute/text-only toggle, and every phone always shows the same text on screen (D8).
- **Sound and vibration:** chimes are generated with WebAudio (no audio files) and are
  identical on every device. `navigator.vibrate` gives the same pattern on every phone
  at each hour start and end (D7). iOS Safari has no Vibration API, so iPhones get the
  chime/narration and the screen change only.
- **Wake lock:** `navigator.wakeLock.request('screen')` from role reveal until dawn. It
  is re-requested on `visibilitychange`. If it isn't supported, a tip says "keep your
  screen on".
- **Theme:** cozy night palette (indigo, cream, cheddar), rounded cards, original inline
  SVG mice/cheese/moon plus emoji. No scanned or copied art. Mobile-first portrait,
  `100dvh` layout, safe-area insets, `font-size: 16px`+ inputs (no iOS zoom).

---

## 9. File layout

```
package.json          engines node>=20; scripts: start, dev (node --watch), test (node --test)
render.yaml           Render Blueprint (M6)
RULES.md  PLAN.md  DEPLOY.md  README.md
game/
  rules.js            pure rules + viewFor + RULE_OPTIONS
  rng.js              seedable RNG (mulberry32) + crypto RNG for production
server/
  index.js            Express, /healthz, static, ws upgrade, heartbeat, PORT/0.0.0.0
  rooms.js            RoomManager: codes, lookup, inactivity sweep
  room.js             Room: seats, tokens, sockets, timers, host migration, broadcasting
  protocol.js         intent validation (allowlists, sizes), error codes
  bots.js             bot seat behaviour
public/
  index.html
  sw.js               app-shell service worker (M5)
  css/app.css
  js/main.js          boot, store (latest view), screen router
  js/net.js           socket, hello/token, heartbeat, backoff reconnect
  js/narrator.js      speechSynthesis + text captions per phase
  js/cues.js          WebAudio chimes, vibration, wake lock
  js/screens/{connecting,home,lobby,reveal,night,discussion,vote,results,notice}.js
  img/*.svg           original art
test/
  rules.test.js       roles, per-hour visibility per player count, followers, peek,
                      votes/ties, wins, edge cases from RULES.md §10
  protocol.test.js    intent validation
  server.test.js      lobby flows over real sockets: create/join/kick/dupe/late join,
                      reconnect, host migration, expiry, healthz
  leak.test.js        full games, every count 4..max, many seeds; schema + entitlement
                      + indistinguishability checks (§6)
  helpers/            test client, fake clock
```

---

## 10. Bot / debug mode

- Bots are enabled when `ENABLE_BOTS` isn't `"false"` (default on, since this is a
  private game). The host gets "Add bot 🤖" in the lobby.
- Bots are ordinary seats driven server-side. They confirm the reveal, steal and choose
  a Follower at random, peek at random, and vote at random after a short delay. They go
  through exactly the same `applyIntent` path as people. In tests the leak checks also
  cover views generated for bots.
- `?debug=1` adds a "fast timers" preset (hours 4 s, discussion 20 s, vote 15 s), and a
  `&seat=N` parameter that namespaces the localStorage key, so several tabs on one
  laptop can be different players.
- There is deliberately **no** "god view" in the client. Server logs at
  `LOG_LEVEL=debug` print the deal for debugging locally.

---

## 11. Milestones

Each milestone ends with `npm test` green, a commit and push, and a short "how to try
it" note.

1. **`game/rules.js` + unit tests.** Deal, dice, the hour engine, visibility per hour
   and per player count, steal, Follower resolution, peek, vote tally and ties (Q6), win conditions, and `viewFor`. Try it: `npm test`.
2. **Server + protocol + lobby.** Express/ws, `/healthz`, create/join/kick/duplicate
   names/late joiners, tokens and seat reclaim, bots, and a minimal Home/Lobby UI. Try
   it: `npm run dev`, open two tabs (or a phone on the same Wi-Fi), add bots.
3. **Night phase.** Server clock, role reveal, intro/hours/dawn, per-player night views,
   narration, cues, wake lock, Night screens, and the first leak tests. Try it: a solo
   game with 3 bots on fast timers.
4. **Day, vote, results, replay.** Discussion, simultaneous vote, results, play again,
   and full-game leak tests for every player count.
5. **Robustness and polish.** Heartbeat, backoff reconnect, host migration, expiry, room
   expired/restart handling, the wake-up screen plus service worker, iOS/Android
   checks, and art and animation polish.
6. **Deploy.** `render.yaml` (runtime node, `npm install`, `npm start`,
   healthCheckPath `/healthz`, free plan) and DEPLOY.md (push to GitHub, create the
   service from the Blueprint, check `/healthz`, test with two phones).
