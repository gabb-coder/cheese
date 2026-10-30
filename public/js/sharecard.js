// The results as a picture to post in the group chat: who the Thief was, whether they got
// caught, everyone's role and the scoreboard. Drawn on a canvas from the results view
// (everything on it is public once the results are out) and shared through the phone's
// share sheet, or shown to save where a browser can't share files.
//
// The picture is drawn as soon as the results appear, because phones only allow sharing
// straight after a tap: drawing first could take too long.

import { h, toast } from './dom.js';
import { avatar, openSheet } from './components.js';
import { t, lang } from './i18n.js';

const W = 1080;
const H = 1350;
const INK = '#2b1d14';
const MUTED = '#7a6553';
const CREAM = '#fff6e3';
const CHEDDAR = '#ffc23d';
const TOMATO = '#e8553e';
const GREEN = '#3e9b5f';
const DISPLAY = "'Fredoka', 'Nunito', system-ui, sans-serif";
const BODY = "'Nunito', system-ui, sans-serif";

let cached = null; // { key, promise }

function cardKey(view) {
  return `${view.room.code}:${view.room.round}:${lang()}`;
}

// Start drawing this round's card (once).
export function prepareCard(view) {
  const key = cardKey(view);
  if (cached?.key !== key) {
    const promise = drawCard(view).catch(() => drawCard(view, { plainMice: true }));
    promise.catch(() => {}); // reported when someone taps Share
    cached = { key, promise };
  }
  return cached.promise;
}

export async function shareCard(view) {
  let blob;
  try {
    blob = await prepareCard(view);
  } catch {
    toast(t('share.failed'));
    return;
  }
  const file = new File([blob], 'cheese-thief.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('app.title') });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // closed the share sheet
    }
  }
  showCard(blob);
}

// No file sharing here (most computers): show the picture to save.
function showCard(blob) {
  const reader = new FileReader();
  reader.onload = () => {
    const url = reader.result;
    openSheet(t('share.title'), (close) => [
      h('h2', {}, t('share.title')),
      h('img', { class: 'share-preview', src: url, alt: t('share.alt') }),
      h('p', { class: 'muted small center' }, t('share.hold')),
      h('a', { class: 'btn-primary btn-block', href: url, download: 'cheese-thief.png' }, t('share.save')),
      h('button', { class: 'btn-secondary btn-block', onClick: close }, t('share.close')),
    ]);
  };
  reader.readAsDataURL(blob);
}

// ---------------------------------------------------------------------------
// Drawing

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function mouseImage(player) {
  const el = avatar(player, 64).querySelector('svg');
  el.setAttribute('width', '128');
  el.setAttribute('height', '128');
  const markup = new XMLSerializer().serializeToString(el);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Fits `text` on at most `lines` lines of `width`, shrinking the font if it must.
function wrapText(ctx, text, { x, y, width, size, font, weight, lineHeight = 1.15, lines = 2, align = 'center' }) {
  let s = size;
  let rows;
  for (;;) {
    ctx.font = `${weight} ${s}px ${font}`;
    rows = [];
    // Split on spaces, or between characters for languages without them.
    const words = /\s/.test(text) ? text.split(/(\s+)/) : [...text];
    let row = '';
    for (const word of words) {
      const next = row + word;
      if (ctx.measureText(next.trim()).width > width && row.trim()) {
        rows.push(row.trim());
        row = word.trimStart();
      } else {
        row = next;
      }
    }
    if (row.trim()) rows.push(row.trim());
    if (rows.length <= lines || s <= size * 0.6) break;
    s -= 4;
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  rows.slice(0, lines).forEach((r, i) => ctx.fillText(r, x, y + i * s * lineHeight));
  return y + (Math.min(rows.length, lines) - 1) * s * lineHeight;
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = [...text];
  while (out.length > 1 && ctx.measureText(`${out.join('')}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.join('')}…`;
}

async function drawCard(view, { plainMice = false } = {}) {
  await Promise.all([
    document.fonts?.load(`600 64px 'Fredoka'`),
    document.fonts?.load(`800 30px 'Nunito'`),
  ].map((p) => p?.catch(() => {})));

  const r = view.results;
  const name = (id) => view.players.find((p) => p.id === id)?.name ?? t('someone');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Morning sky, and a cream card like the game's.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#ffe9c8');
  sky.addColorStop(1, '#ffc98a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  roundRect(ctx, 48, 58, W - 96, H - 106, 48);
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  roundRect(ctx, 48, 44, W - 96, H - 106, 48);
  ctx.fill();
  ctx.stroke();

  // Header: the game's name and the room.
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `600 52px ${DISPLAY}`;
  ctx.fillText(`🧀 ${t('app.title')}`, 100, 136);
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = `800 28px ${BODY}`;
  ctx.fillText(t('game.room', { code: view.room.code }), W - 100, 132);

  // The Thief, with the stamp.
  const thiefArt = await loadImage('img/role-thief.svg');
  const artH = 250;
  const artW = (thiefArt.naturalWidth / thiefArt.naturalHeight) * artH || artH;
  ctx.drawImage(thiefArt, (W - artW) / 2, 180, artW, artH);
  ctx.save();
  ctx.translate(W / 2 + 190, 232);
  ctx.rotate(r.thiefCaught ? 0.16 : -0.14);
  ctx.font = `600 50px ${DISPLAY}`;
  const stamp = t(r.thiefCaught ? 'results.caught' : 'results.away').toUpperCase();
  const sw = ctx.measureText(stamp).width + 48;
  ctx.strokeStyle = r.thiefCaught ? TOMATO : GREEN;
  ctx.fillStyle = 'rgba(255,246,227,0.92)';
  ctx.lineWidth = 7;
  roundRect(ctx, -sw / 2, -44, sw, 82, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = r.thiefCaught ? TOMATO : GREEN;
  ctx.textAlign = 'center';
  ctx.fillText(stamp, 0, 16);
  ctx.restore();

  // The verdict.
  ctx.fillStyle = INK;
  const headline = t(r.thiefCaught ? 'results.wasThief' : 'results.gotAway', { name: name(r.thiefId) });
  const lastLine = wrapText(ctx, headline, { x: W / 2, y: 518, width: 860, size: 64, font: DISPLAY, weight: 600 });
  ctx.fillStyle = MUTED;
  const subLine = wrapText(ctx, r.thiefCaught ? t('results.sleepyWin') : t('results.thiefWin', { name: name(r.followerId) }),
    { x: W / 2, y: lastLine + 56, width: 860, size: 34, font: BODY, weight: 700, lines: 2 });

  // Everyone: mouse, name, role; the winners on a cheese-coloured disc.
  const players = [...view.players].sort((a, b) => (r.winners.includes(b.id) - r.winners.includes(a.id)) || a.name.localeCompare(b.name));
  const perRow = 4;
  const cellW = 220;
  const top = subLine + 100; // centre of the first row of mice
  const rowH = 206;
  const mice = await Promise.all(players.map((p) => (plainMice ? null : mouseImage(p).catch(() => null))));
  players.forEach((p, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, players.length - row * perRow);
    const cx = W / 2 + (i % perRow - (inRow - 1) / 2) * cellW;
    const cy = top + row * rowH;
    const won = r.winners.includes(p.id);
    ctx.fillStyle = won ? CHEDDAR : '#efe3cb';
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, Math.PI * 2);
    ctx.fill();
    if (mice[i]) {
      ctx.drawImage(mice[i], cx - 50, cy - 52, 100, 100);
    } else {
      ctx.fillStyle = '#c9b8a6';
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.fill();
    }
    if (won) {
      ctx.font = `36px ${BODY}`;
      ctx.textAlign = 'center';
      ctx.fillText('🏆', cx + 46, cy - 32);
    }
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = `800 30px ${BODY}`;
    ctx.fillText(fitText(ctx, p.name, cellW - 16), cx, cy + 88);
    ctx.fillStyle = p.id === r.thiefId ? TOMATO : MUTED;
    ctx.font = `700 24px ${BODY}`;
    const role = p.id === r.thiefId ? t('results.thief') : p.id === r.followerId ? t('results.follower') : t('results.sleepyhead');
    ctx.fillText(role, cx, cy + 118);
  });

  // The scoreboard, once the room has played more than one round.
  const scores = view.room.scores ?? {};
  const board = view.players.filter((p) => scores[p.id]).sort((a, b) => scores[b.id].wins - scores[a.id].wins || a.name.localeCompare(b.name));
  // Kept near the bottom, above the footer, however many rows of mice there are.
  const boardY = Math.max(top + (Math.ceil(players.length / perRow) - 1) * rowH + 190, H - 220);
  if (view.room.round > 1 && board.length) {
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = `600 32px ${DISPLAY}`;
    ctx.fillText(`${t('score.title')} · ${t('score.rounds', { n: view.room.round })}`, W / 2, boardY);
    // One line, best first; whoever doesn't fit becomes "…".
    ctx.fillStyle = MUTED;
    ctx.font = `700 28px ${BODY}`;
    const entries = board.map((p) => `${p.name} ${scores[p.id].wins}`);
    let shown = entries.length;
    const lineOf = (n) => entries.slice(0, n).join('  ·  ') + (n < entries.length ? '  ·  …' : '');
    while (shown > 1 && ctx.measureText(lineOf(shown)).width > 880) shown -= 1;
    ctx.fillText(fitText(ctx, lineOf(shown), 880), W / 2, boardY + 46);
  }

  // Footer: where to play.
  ctx.fillStyle = '#b39c86';
  ctx.textAlign = 'center';
  ctx.font = `700 24px ${BODY}`;
  ctx.fillText(location.host, W / 2, H - 92);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}
