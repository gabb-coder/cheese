// End-to-end robustness checks in real (headless) browsers. Optional: needs Playwright
// with Chromium installed (`npx playwright install chromium`). Not part of `npm test`.
//
//   npm run test:e2e
//
// Scenarios: reload mid-night keeps your seat; server crash or graceful restart -> the
// phones rebuild the same room; a room that is really gone -> "Room expired";
// every screen fits narrow, short and sideways phones; host drops -> someone else becomes host;
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
  const newPlayer = async (device = PHONE) => {
    const ctx = await browser.newContext(device);
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

async function roomWith(newPlayer, names, devices = []) {
  const pages = [];
  const host = await newPlayer(devices[0]);
  await host.goto(`${BASE}/?debug=1`);
  await host.fill('#name', names[0]);
  await host.click('text=Create a room');
  await host.waitForSelector('.room-code');
  const code = await host.getAttribute('.room-code', 'data-code');
  pages.push(host);
  for (const [i, name] of names.slice(1).entries()) {
    const p = await newPlayer(devices[i + 1]);
    await p.goto(`${BASE}/?r=${code}`);
    await p.fill('#name', name);
    await p.click('button:has-text("Join")');
    await p.waitForSelector('.room-code');
    pages.push(p);
  }
  return { pages, code };
}

// Role card, then the dice cup: tap to shake, then confirm.
async function rollAndConfirm(p) {
  await p.click('text=Next: roll your die');
  await p.click('.cup-stage');
  await p.click("text=I've memorized it");
}

// The die under this player's cup.
const dieUnderCup = (p) => p.evaluate(() => document.querySelector('.cup-die svg').getAttribute('aria-label').match(/\d/)[0]);

async function startGame(pages) {
  await pages[0].click('text=Start the game');
  for (const p of pages) {
    await p.waitForSelector('text=Next: roll your die');
    await rollAndConfirm(p);
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
  await p.click('text=Next: roll your die');
  const die = await dieUnderCup(p);
  await p.reload();
  await p.waitForSelector('.hold-card', { timeout: 15000 });
  await p.click('text=Next: roll your die');
  if ((await dieUnderCup(p)) !== die) throw new Error('die changed after reloading during the reveal');
  await p.click('text=See my card again');

  for (const page of pages) await rollAndConfirm(page);
  await p.waitForSelector('.hour-track');
  await p.reload();
  await p.waitForSelector('.hour-track', { timeout: 15000 }); // back in the night
  await p.waitForSelector('text=Time to talk', { timeout: 30000 });
  const notes = await p.textContent('.notes');
  if (!notes.includes(`You rolled a ${die}`)) throw new Error(`night notes don't match the die ${die}: ${notes}`);
});

await scenario('server crash mid-game: everyone is put back in the same room', async (newPlayer) => {
  const { pages, code } = await roomWith(newPlayer, ['Ana', 'Ben', 'Cy', 'Dee']);
  await startGame(pages);
  await stopServer('SIGKILL');
  await pages[2].waitForSelector('text=Reconnecting', { timeout: 5000 });
  await startServer();
  for (const p of pages) {
    await p.waitForSelector('.room-code', { timeout: 30000 });
    if ((await p.getAttribute('.room-code', 'data-code')) !== code) throw new Error('came back to a different room');
  }
  await pages[0].waitForSelector('text=A server update stopped the game', { timeout: 5000 });
  await pages[0].waitForSelector('text=Start the game', { timeout: 5000 }); // Ana is host again
  const names = await pages[3].evaluate(() => [...document.querySelectorAll('.seat:not(.empty):not(.leaving) .name')].map((n) => n.textContent));
  for (const name of ['Ana', 'Ben', 'Cy', 'Dee']) if (!names.some((n) => n.includes(name))) throw new Error(`${name} missing: ${names}`);
});

await scenario('graceful restart (redeploy): the lobby comes back with its bots and settings', async (newPlayer) => {
  const { pages, code } = await roomWith(newPlayer, ['Ana', 'Ben']);
  await pages[0].click('text=Add a bot');
  await pages[1].waitForFunction(() => document.querySelectorAll('.seat:not(.empty):not(.leaving)').length === 3);
  await stopServer('SIGTERM');
  await pages[1].waitForSelector('text=Getting your room back', { timeout: 5000 });
  await startServer();
  for (const p of pages) {
    await p.waitForSelector('text=after a server update', { timeout: 30000 });
    if ((await p.getAttribute('.room-code', 'data-code')) !== code) throw new Error('came back to a different room');
  }
  await pages[1].waitForFunction(() => document.querySelectorAll('.seat:not(.empty):not(.leaving)').length === 3);
});

await scenario('rebuilding gives up when the room really is gone', async (newPlayer) => {
  const p = await newPlayer();
  await p.goto(`${BASE}/`);
  await p.waitForSelector('#name');
  // A phone that remembers a room this server never had and can no longer rebuild.
  await p.evaluate(() => {
    localStorage.setItem('cheese:session', JSON.stringify({ room: 'QQQQ', token: 'a'.repeat(22), playerId: 'x' }));
    localStorage.setItem('cheese:lastRoom', JSON.stringify({ code: 'QQQQ', name: 'Zed', savedAt: Date.now() - 60 * 60 * 1000 }));
  });
  await p.reload();
  await p.waitForSelector('text=Room expired', { timeout: 10000 });
});

await scenario('every screen fits narrow, short and sideways phones (no sideways scrolling)', async (newPlayer) => {
  const sized = (width, height) => ({ ...PHONE, viewport: { width, height }, isMobile: width < 1000, hasTouch: true });
  const devices = [sized(280, 653), sized(320, 568), sized(667, 375), { viewport: { width: 1280, height: 800 } }];
  const { pages } = await roomWith(newPlayer, ['Bartholomew Chia', 'Maximilian Ovens', 'Christopher Lee', 'Jonathan Tan'], devices);
  const check = async (step) => {
    for (const [i, p] of pages.entries()) {
      const extra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (extra > 0) throw new Error(`${step}: ${devices[i].viewport.width}x${devices[i].viewport.height} scrolls sideways by ${extra}px`);
    }
  };
  await check('lobby');
  await pages[0].click('text=Start the game');
  for (const p of pages) await p.waitForSelector('text=Next: roll your die');
  await check('role card');
  for (const p of pages) { await p.click('text=Next: roll your die'); await p.click('.cup-stage'); }
  await check('dice cup');
  for (const p of pages) await p.click("text=I've memorized it");
  await pages[0].waitForSelector('.react-bar:not([hidden])', { timeout: 60000 });
  await check('discussion');
  await pages[0].click('text=vote now');
  for (const p of pages) { await p.waitForSelector('.vote-choice'); await p.click('.vote-choice >> nth=0'); await p.click('.btn-big'); }
  await pages[0].waitForSelector('.verdict', { timeout: 20000 });
  await check('results');
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
