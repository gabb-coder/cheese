// End-to-end robustness checks in real (headless) browsers. Optional: needs Playwright
// with Chromium installed (`npx playwright install chromium`). Not part of `npm test`.
//
//   npm run test:e2e
//
// Scenarios: reload mid-night keeps your seat; server crash -> "Room expired";
// graceful restart -> "Room expired" at once; host drops -> someone else becomes host;
// cold start -> cached app shows "Waking up the mouse hole" and connects by itself, even
// when the host answers with its own wake-up page meanwhile.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

let server = null;
function startServer() {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), TIME_SCALE: '0.2' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve) => server.stdout.on('data', (d) => { if (/listening/.test(d)) resolve(); }));
}
function stopServer(signal = 'SIGTERM') {
  const proc = server;
  server = null;
  return new Promise((resolve) => { proc.once('exit', resolve); proc.kill(signal); });
}

const results = [];
async function scenario(name, fn) {
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return; // e.g. E2E_ONLY="cold start"
  const browser = await chromium.launch();
  const errors = [];
  const newPlayer = async () => {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    return page;
  };
  try {
    if (!server) await startServer();
    await fn(newPlayer);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    results.push([name, 'PASS']);
  } catch (err) {
    results.push([name, `FAIL: ${err.message.split('\n')[0]}`]);
  } finally {
    await browser.close();
  }
}

async function roomWith(newPlayer, names) {
  const pages = [];
  const host = await newPlayer();
  await host.goto(`${BASE}/?debug=1`);
  await host.fill('#name', names[0]);
  await host.click('text=Create a room');
  await host.waitForSelector('.room-code');
  const code = (await host.textContent('.room-code')).trim();
  pages.push(host);
  for (const name of names.slice(1)) {
    const p = await newPlayer();
    await p.goto(`${BASE}/?r=${code}`);
    await p.fill('#name', name);
    await p.click('button:has-text("Join")');
    await p.waitForSelector('.room-code');
    pages.push(p);
  }
  return { pages, code };
}

async function startGame(pages) {
  await pages[0].click('text=Start the game');
  for (const p of pages) {
    await p.waitForSelector("text=I've memorized it");
    await p.click("text=I've memorized it");
  }
}

await scenario('reloading keeps your seat, role and die (during reveal and mid-night)', async (newPlayer) => {
  const { pages } = await roomWith(newPlayer, ['Ana', 'Ben', 'Cy', 'Dee']);
  await pages[0].click('text=Start the game');
  const p = pages[1];
  await p.waitForSelector('.hold-card');
  const card = () => p.evaluate(() => document.querySelector('.hold-card .secret').textContent);
  const before = await card();
  await p.reload();
  await p.waitForSelector('.hold-card', { timeout: 15000 });
  if ((await card()) !== before) throw new Error('role card changed after reloading during the reveal');
  const die = before.match(/(\d) o'clock/)[1];

  for (const page of pages) await page.click("text=I've memorized it");
  await p.waitForSelector('.hour-track');
  await p.reload();
  await p.waitForSelector('.hour-track', { timeout: 15000 }); // back in the night
  await p.waitForSelector('text=Time to talk', { timeout: 30000 });
  const notes = await p.textContent('.notes');
  if (!notes.includes(`You rolled a ${die}`)) throw new Error(`night notes don't match the die ${die}: ${notes}`);
});

await scenario('server crash mid-game: players are told the room expired', async (newPlayer) => {
  const { pages } = await roomWith(newPlayer, ['Ana', 'Ben', 'Cy', 'Dee']);
  await startGame(pages);
  await stopServer('SIGKILL');
  await pages[2].waitForSelector('text=Reconnecting', { timeout: 5000 });
  await startServer();
  await pages[2].waitForSelector('text=Room expired', { timeout: 20000 });
  await pages[2].click('text=Back to start');
  await pages[2].waitForSelector('text=Create a room');
});

await scenario('graceful restart (redeploy): players see "Room expired" at once', async (newPlayer) => {
  const { pages } = await roomWith(newPlayer, ['Ana', 'Ben']);
  await stopServer('SIGTERM');
  await pages[1].waitForSelector('text=Room expired', { timeout: 5000 });
  await startServer();
});

await scenario('host drops: another player becomes host after the grace period', async (newPlayer) => {
  const { pages } = await roomWith(newPlayer, ['Ana', 'Ben', 'Cy']);
  await pages[0].context().close();
  await pages[1].waitForSelector("text=You're the host now", { timeout: 15000 });
  await pages[1].waitForSelector('text=Add a bot');
});

await scenario('cold start: cached app shows the waking-up screen, then connects by itself', async (newPlayer) => {
  const p = await newPlayer();
  await p.goto(`${BASE}/`);
  await p.waitForSelector('#name');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); // make sure the service worker controls the page and has cached it
  await p.waitForSelector('#name');
  await stopServer('SIGKILL');
  await p.reload();
  await p.waitForSelector('text=Waking up the mouse hole', { timeout: 10000 });
  await startServer();
  await p.waitForSelector('#name', { timeout: 20000 });
});

await scenario("cold start behind the host's wake-up page: the cached app is shown, not that page", async (newPlayer) => {
  const p = await newPlayer();
  await p.goto(`${BASE}/`);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForSelector('#name');
  await stopServer('SIGKILL');
  // Stand-in for Render's "service waking up" page: 200 OK, but not from our server.
  const http = await import('node:http');
  const fake = http.createServer((req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>HOST IS WAKING UP</h1>'));
  await new Promise((resolve) => fake.listen(PORT, '127.0.0.1', resolve));
  try {
    await p.reload();
    await p.waitForSelector('text=Waking up the mouse hole', { timeout: 10000 });
    if (await p.locator('text=HOST IS WAKING UP').count()) throw new Error("showed the host's page");
  } finally {
    fake.closeAllConnections();
    await new Promise((resolve) => fake.close(resolve));
  }
  await startServer();
  await p.waitForSelector('#name', { timeout: 20000 });
  await p.reload(); // the next load must still be our app (the fake page was never cached)
  await p.waitForSelector('#name', { timeout: 10000 });
});

if (server) await stopServer();
let failed = 0;
for (const [name, outcome] of results) {
  console.log(`${outcome.startsWith('PASS') ? '✔' : '✖'} ${name}${outcome === 'PASS' ? '' : `\n    ${outcome}`}`);
  if (outcome !== 'PASS') failed++;
}
process.exit(failed ? 1 : 0);
