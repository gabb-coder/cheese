# Deploying Cheese Thief to Render

The whole game (web page, `/healthz` and the game WebSocket) runs as **one free Render Web
Service**, described by [`render.yaml`](render.yaml). Rooms live in memory, so there is no
database to set up.

Time needed: about 10 minutes, plus a few minutes for the first build.

---

## 1. Get the code onto GitHub's `main` branch

The code is on GitHub in `gabb-coder/cheese`, on the branch
`claude/cheese-thief-game-app-8m2pm5`. Render deploys from whichever branch you pick in
step 2. Using `main` is simplest, so merge the work into it first. Either:

- **On GitHub:** open the repository, click **Compare & pull request** for the branch
  (or **Pull requests → New pull request**, base `main`, compare
  `claude/cheese-thief-game-app-8m2pm5`), then **Create pull request** and **Merge**.
- **Or from a terminal:**
  ```sh
  git checkout main
  git pull
  git merge claude/cheese-thief-game-app-8m2pm5
  git push origin main
  ```

Check that `render.yaml` is at the top level of `main` on GitHub.

> Before deploying, you can run everything locally: `npm install && npm test`, then
> `npm run dev` and open http://localhost:3000.

## 2. Create the service from the Blueprint

1. Sign in at <https://dashboard.render.com> (signing up with GitHub is easiest).
2. Click **New → Blueprint**.
3. If asked, connect your GitHub account and give Render access to the `cheese`
   repository (you can allow just that one repository).
4. Click **Connect** next to `gabb-coder/cheese`.
5. Fill in the form:
   - **Blueprint Name:** anything, e.g. `cheese-thief`.
   - **Branch:** `main`.
   - **Blueprint Path:** leave empty (`render.yaml` is at the top level).
6. Render shows what it will create: **one web service called `cheese-thief`** on the
   **Free** plan. Click **Deploy Blueprint**.

What the Blueprint sets up (you don't need to type any of this):

| Setting | Value |
|---|---|
| Type / runtime | Web Service, Node |
| Plan | Free |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Auto-deploy | on every push to `main` |
| Environment | `NODE_VERSION=22`, `ENABLE_BOTS=true` |

**Region:** the Blueprint uses Render's default region (Oregon, USA). If you and your
friends are far from there, uncomment the `region:` line in `render.yaml` and set the
closest one (`ohio`, `virginia`, `frankfurt` or `singapore`) **before** step 2. The region
can't be changed after the service is created. It only affects latency, and the game
isn't latency-sensitive, so the default is fine anywhere.

## 3. Watch the first deploy and confirm the health check

1. Open the **cheese-thief** service in the dashboard and click **Logs**. You should see
   `npm install` finish and then:
   ```
   Cheese Thief listening on http://0.0.0.0:10000 (bots on)
   ```
   (Render picks the port and passes it in `PORT`; the server listens on it at
   `0.0.0.0`.)
2. The status at the top changes to **Live** once the health check passes. Under
   **Events** you'll see "Deploy live".
3. Find your URL at the top of the service page, e.g.
   `https://cheese-thief.onrender.com` (Render adds a random suffix if the name is taken).
4. Open `https://<your-url>/healthz` in a browser. It should show just `ok`. From a
   terminal:
   ```sh
   curl -i https://<your-url>/healthz      # HTTP/2 200 ... ok
   ```

## 4. Test from two phones

1. **Phone A:** open `https://<your-url>`, enter a name and tap **Create a room**. You
   see a 4-letter room code.
2. **Phone B:** tap **🔗 Share invite link** on phone A and send it to phone B, or open
   the URL on phone B and type the code. Join with a different name. Both phones should
   now list both players.
3. You need 4 players to start. Either get two more phones, or on phone A (the host) tap
   **🤖 Add a bot** twice.
4. Optional, for a quick test: on phone A open **⚙️ Game settings** and pick short times
   (e.g. 10 s hours, 1 min discussion, 30 s voting).
5. Tap **Start the game**. On each phone, press and hold the card to see your role, then
   tap **I've memorized it**.
6. Tap the screen once on the host's phone so the browser allows sound; it reads the
   night out loud. Any phone can turn narration on or off with 🔊.
7. Play through the night, discussion and vote, and check that the results appear on
   both phones and that **🔁 Play again** brings everyone back to the lobby.

Worth checking while you test:

- **Reconnect:** lock phone B for a few seconds mid-game and unlock it. It should
  reconnect by itself and stay in the same seat. A full refresh also keeps your seat.
- **Screen stays on** during the night (iOS 16.4+ / recent Android Chrome). If a phone
  dims anyway, turn off low-power mode or raise the auto-lock time.
- **Add to home screen** (Share → Add to Home Screen on iPhone, ⋮ → Install app on
  Android) gives a full-screen app icon.

## 5. Day-to-day: what to expect on the free plan

- **Cold starts.** A free service goes to sleep after 15 minutes without traffic. The
  next visit wakes it, which takes **about a minute**. The very first visit shows
  Render's own loading page. After that, players who have opened the game before see the
  game's **"Waking up the mouse hole…"** screen at once, and it connects by itself when
  the server is up. Tip: open the link yourself a minute before game night.
- **While anyone has the game open, the server stays awake**, because phones ping it
  every 20 seconds. It sleeps 15 minutes after the last phone closes or locks.
- **Redeploys and restarts wipe all rooms.** Rooms only live in memory. Every push to
  `main` triggers a redeploy, and Render may also restart free services at any time.
  Players then see **"Room expired. Create a new one!"**, never a frozen screen. Avoid
  pushing changes during a game.
- **Rooms expire** about 30 minutes after the last phone left.
- **Free hours.** Render gives 750 free instance hours per month per workspace. That's
  enough to run one service all month, but it's shared with any other free services you
  have. If they run out, the service is suspended until the next month.

## 6. Settings (environment variables)

Change these under the service's **Environment** tab (saving triggers a redeploy), or in
`render.yaml`.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | set by Render | Port to listen on. Don't set it yourself. |
| `NODE_VERSION` | `22` | Node.js version Render installs. |
| `ENABLE_BOTS` | `true` | `false` hides the **Add a bot** button. |
| `LOG_LEVEL` | (unset) | `debug` logs room creation. |
| `TIME_SCALE` | (unset) | Debugging only: makes every timer faster. **Don't set this in production.** |

## 7. Troubleshooting

| Symptom | What to check |
|---|---|
| Deploy fails during build | **Logs**: `npm install` errors. Make sure `package.json` and `package-lock.json` are on `main`. |
| Deploy fails the health check | **Logs**: the server must print `listening on http://0.0.0.0:<port>`. A crash on start shows the error just above. |
| Page loads but stays on "Waking up the mouse hole…" for more than 2 minutes | Check the service status in the dashboard (suspended? out of free hours?) and <https://status.render.com>. Some strict networks block WebSockets; try mobile data. |
| Players keep seeing "Room expired" | The service restarted: look in **Events** for deploys or restarts at that time. |
| No narration | Tap the screen once (browsers block sound until you interact), check 🔊 is on for that phone, and check the ringer/silent switch on iPhones. |
| A phone shows "Playing somewhere else" | The same seat was opened in another tab or browser. Tap **Play on this device**. |

## 8. Optional

- **Custom domain:** service → **Settings → Custom Domains**.
- **No cold starts:** switch the service to a paid instance type (Settings → Instance
  Type). Nothing in the code needs to change. Keep it to a single instance, because rooms
  live in that instance's memory.
