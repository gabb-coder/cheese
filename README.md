# Cheese Thief (digital)

A private, mobile-first web version of the social deduction game *Cheese Thief*
(designed by Dongxu Li) for 4-8 friends, one phone each.

- Rules reference: [RULES.md](RULES.md) (owner decisions in §11)
- Plan: [PLAN.md](PLAN.md)
- **Deploying to Render: [DEPLOY.md](DEPLOY.md)**

## Status
All 6 milestones done: the whole game is playable, robust to refreshes, dropped
connections, sleeping phones, host disconnects, server restarts and cold starts, and
ready to deploy as a single Render Web Service (`render.yaml`, see DEPLOY.md).

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

Players can add the game to their home screen (it has a web manifest and icons); on
https (or localhost) a service worker caches the app so it opens instantly.

## Run the tests

```sh
npm test
```

Optional browser checks (reload mid-night, server crash and restart, host drop, cold start
from the cached app). They need Playwright with Chromium:

```sh
npm i --no-save playwright && npx playwright install chromium
npm run test:e2e
```

## Music
Four original music-box tunes, composed in `public/js/music.js` and synthesised by the phone
(no audio files): a waltz for the lobby, a lullaby for the night, a bouncy tune for the
morning and results, and a ticking clock for the vote. They play on the narrator phone by
default, duck while the narrator speaks, and follow only the step of the game, so they give
nothing away. Any phone can switch the music on or off in ⚙️.

## Easter egg
Tap the little mouse in the bottom-right corner of the Home screen for a Bible verse; each
tap shows another (all 22 come round before any repeats). English is the NIV, Chinese the
Chinese New Version (Simplified, CNVS). The verses in `public/js/verses.js` were taken
from BibleGateway's text of each translation, not retyped, and are shown with each
publisher's copyright notice.

## Languages
English and Simplified Chinese (Mandarin, 奶酪大盗). Each phone picks its own language with
the ⚙️ button (Home, Lobby and the in-game top bar); it starts in Chinese when the phone's
language is Chinese. The choice stays on the phone, and the narration speaks it too. All
text lives in `public/js/i18n.js`; `test/i18n.test.js` checks both languages match.

## Art and fonts
All illustrations (the mice, cheese, moon, mouse hole, …) are original SVGs, in
`public/img` or drawn in code in `public/js/components.js`, made for this project.
Animations are plain CSS (plus a little JS for the flip-board code, confetti and vote
count-up) and switch off when a phone asks for reduced motion. The night sky follows only
the step of the game, so every sleeping phone looks exactly alike. Fonts: [Fredoka](https://github.com/hafontia/Fredoka-One)
and [Nunito](https://github.com/googlefonts/nunito), both under the SIL Open Font License
(licence files next to the fonts in `public/fonts`). No assets from the physical game are used.
