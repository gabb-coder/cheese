// Service worker: keeps a copy of the app shell (PLAN.md §7, cold starts).
//
// Network first, so a redeploy is picked up straight away. But if the network hasn't
// answered within a few seconds (Render's free tier waking from sleep can take up to a
// minute), the cached copy is used, so the player sees the "Waking up the mouse hole"
// screen at once while the socket keeps retrying. Never touches /ws or /healthz.

const CACHE = 'cheese-thief-shell';
const NETWORK_TIMEOUT_MS = 3000;

// Every file in public/ except this one (test/sw.test.js keeps this list complete).
const SHELL = [
  '/',
  '/css/app.css',
  '/fonts/OFL-Fredoka.txt',
  '/fonts/OFL-Nunito.txt',
  '/fonts/fredoka-latin-ext.woff2',
  '/fonts/fredoka-latin.woff2',
  '/fonts/nunito-latin-ext.woff2',
  '/fonts/nunito-latin.woff2',
  '/img/apple-touch-icon.png',
  '/img/cheese.svg',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/logo.svg',
  '/img/moon.svg',
  '/img/pair.svg',
  '/img/plate.svg',
  '/img/role-sleepy.svg',
  '/img/role-thief.svg',
  '/img/sun.svg',
  '/index.html',
  '/js/clock.js',
  '/js/components.js',
  '/js/cues.js',
  '/js/dom.js',
  '/js/guide.js',
  '/js/i18n.js',
  '/js/main.js',
  '/js/music.js',
  '/js/narrator.js',
  '/js/net.js',
  '/js/reactions.js',
  '/js/screens/connecting.js',
  '/js/screens/day.js',
  '/js/screens/game.js',
  '/js/screens/home.js',
  '/js/screens/lobby.js',
  '/js/screens/night.js',
  '/js/screens/notice.js',
  '/js/screens/reveal.js',
  '/js/storage.js',
  '/js/verses.js',
  '/js/vendor/qrcode.mjs',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/ws' || url.pathname === '/healthz') return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  // Pages are cached without their query (?r=CODE), so any join link works offline.
  const isPage = req.mode === 'navigate';
  const cached = () => cache.match(isPage ? '/' : req, { ignoreSearch: isPage });

  // Only cache what our own server sent. While a free Render service wakes up, Render
  // answers with its own loading page, which must never replace the cached app.
  const ours = (res) => res.ok && res.headers.get('X-Cheese-Thief') === '1';
  const network = fetch(req).then(async (res) => {
    if (ours(res)) {
      cache.put(isPage ? '/' : req, res.clone());
      return res;
    }
    return (await cached()) ?? res;
  });
  network.catch(() => {}); // if we answer from the cache first, a later failure is fine
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));

  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    return (await cached()) ?? (await network);
  } catch {
    const fallback = await cached();
    if (fallback) return fallback;
    throw new Error('offline and not cached');
  }
}
