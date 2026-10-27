// Reusable pieces for the game screens. Everything here renders only data that is
// already in this player's own view.

import { h } from './dom.js';
import { serverNow } from './clock.js';

const SVG = 'http://www.w3.org/2000/svg';

// Switching apps or locking the phone always hides an open card.
document.addEventListener('visibilitychange', () => {
  for (const card of document.querySelectorAll('.hold-card.open')) card.classList.remove('open');
});

function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const child of children) el.append(child);
  return el;
}

export function nameOf(view, id) {
  return view.players.find((p) => p.id === id)?.name ?? 'someone';
}

export function listNames(view, ids) {
  const names = ids.map((id) => nameOf(view, id));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// An illustration from public/img.
export function art(name, className = '', alt = '') {
  return h('img', { class: `art ${className}`, src: `img/${name}.svg`, alt, draggable: 'false' });
}

// ---------------------------------------------------------------------------
// Mouse avatars: every player gets a mouse whose fur colour comes from their (random,
// public) id, so the same player looks the same on every phone.

const FURS = [
  ['#cdc6dc', '#b8afc9'], // lavender grey
  ['#e8cdb0', '#d6b08c'], // fawn
  ['#f3ede4', '#ddd3c4'], // snow
  ['#b3afc2', '#97929f'], // slate
  ['#f2c38f', '#e3a463'], // ginger
  ['#dcb5a8', '#c79686'], // rose
  ['#c9d3e3', '#a9b6cc'], // silver blue
  ['#c4a68f', '#a88a72'], // cocoa
];

function furFor(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FURS[hash % FURS.length];
}

export function avatar(player, size = 48) {
  const [face, ear] = furFor(player.id);
  const ink = '#2b1d14';
  const parts = [
    svg('circle', { cx: 16, cy: 20, r: 12, fill: ear, stroke: ink, 'stroke-width': 2.5 }),
    svg('circle', { cx: 48, cy: 20, r: 12, fill: ear, stroke: ink, 'stroke-width': 2.5 }),
    svg('circle', { cx: 16, cy: 20, r: 6.5, fill: '#f4a7b9' }),
    svg('circle', { cx: 48, cy: 20, r: 6.5, fill: '#f4a7b9' }),
  ];
  if (player.isBot) {
    parts.push(svg('path', { d: 'M32 20 V8', stroke: ink, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    parts.push(svg('circle', { cx: 32, cy: 7, r: 3.5, fill: '#ffc23d', stroke: ink, 'stroke-width': 2 }));
  }
  parts.push(svg('ellipse', { cx: 32, cy: 38, rx: 20, ry: 18, fill: face, stroke: ink, 'stroke-width': 2.5 }));
  if (player.isBot) {
    parts.push(svg('rect', { x: 22, y: 32, width: 6, height: 6, rx: 1.5, fill: ink }));
    parts.push(svg('rect', { x: 36, y: 32, width: 6, height: 6, rx: 1.5, fill: ink }));
  } else {
    parts.push(svg('circle', { cx: 25, cy: 35, r: 3, fill: ink }));
    parts.push(svg('circle', { cx: 39, cy: 35, r: 3, fill: ink }));
    parts.push(svg('circle', { cx: 26, cy: 34, r: 1, fill: '#fff' }));
    parts.push(svg('circle', { cx: 40, cy: 34, r: 1, fill: '#fff' }));
  }
  parts.push(svg('ellipse', { cx: 20.5, cy: 43, rx: 3.6, ry: 2.1, fill: '#f4a7b9', opacity: 0.8 }));
  parts.push(svg('ellipse', { cx: 43.5, cy: 43, rx: 3.6, ry: 2.1, fill: '#f4a7b9', opacity: 0.8 }));
  parts.push(svg('circle', { cx: 32, cy: 43, r: 2.8, fill: '#ef7f9c', stroke: ink, 'stroke-width': 1.5 }));

  const el = h('span', { class: `avatar${player.isHost ? ' host' : ''}`, 'aria-hidden': 'true' });
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.append(svg('svg', { viewBox: '0 0 64 64' }, parts));
  return el;
}

// ---------------------------------------------------------------------------

// A die showing `n` pips.
const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export function dieFace(n, size = 72) {
  return svg('svg', {
    viewBox: '0 0 100 100', width: size, height: size, class: 'die', role: 'img', 'aria-label': `a die showing ${n}`,
  }, [
    svg('rect', { x: 5, y: 5, width: 90, height: 90, rx: 22, fill: '#fff6e3', stroke: '#2b1d14', 'stroke-width': 6 }),
    ...(PIPS[n] ?? []).map(([cx, cy]) => svg('circle', { cx, cy, r: 9, fill: '#2b1d14' })),
  ]);
}

const ROLE_INFO = {
  thief: {
    art: 'role-thief',
    title: 'You are the Cheese Thief!',
    short: 'Cheese Thief',
    hint: 'Take the cheese on your hour. After hour 6, choose a Follower. Win by not getting the most votes.',
  },
  sleepyhead: {
    art: 'role-sleepy',
    title: 'You are a Sleepyhead',
    short: 'Sleepyhead',
    hint: 'Wake on your hour and see what you can. Then find the Thief and vote them out!',
  },
};

// Press and hold to see your role and die; let go and it hides (PLAN.md §8).
export function holdCard(me, { compact = false } = {}) {
  const info = ROLE_INFO[me.role];
  const secret = compact
    ? h('div', { class: 'secret' },
      art(info.art, 'role-art'),
      h('div', { class: 'grow' }, h('h3', {}, info.short), h('p', { class: 'small' }, `You wake at ${me.die} o'clock`)),
      dieFace(me.die, 48))
    : h('div', { class: 'secret' },
      art(info.art, 'role-art'),
      h('h2', {}, info.title),
      h('div', { class: 'die-row' }, dieFace(me.die, 60), h('span', {}, 'You wake at', h('br'), h('strong', {}, `${me.die} o'clock`))),
      h('p', { class: 'small' }, info.hint));
  const cover = compact
    ? h('div', { class: 'cover' }, h('span', { class: 'badge-pill' }, '🤫 Hold to see your card'))
    : h('div', { class: 'cover' },
      art('logo', 'logo small'),
      h('span', { class: 'badge-pill' }, 'Press & hold to peek'),
      h('span', { class: 'hint' }, "Make sure nobody's looking!"));
  const card = h('div', {
    class: `hold-card${compact ? ' compact' : ''}`,
    tabindex: 0,
    role: 'button',
    'aria-label': 'Press and hold to see your role and die',
  }, cover, secret);

  const open = (e) => {
    e.preventDefault();
    card.classList.add('open');
    if (e.pointerId !== undefined) card.setPointerCapture?.(e.pointerId);
  };
  const close = () => card.classList.remove('open');
  card.addEventListener('pointerdown', open);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) card.addEventListener(type, close);
  card.addEventListener('contextmenu', (e) => e.preventDefault());
  card.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') open(e); });
  card.addEventListener('keyup', close);
  return card;
}

export function countdown(endsAt, label = '') {
  if (!endsAt) return null;
  const el = h('div', { class: 'countdown', 'data-ends-at': endsAt, 'data-total': Math.max(1, endsAt - serverNow()) },
    h('div', { class: 'row' }, h('span', { class: 'muted small grow' }, label), h('span', { class: 'secs' }, '')),
    h('div', { class: 'bar' }, h('i')),
  );
  const left = Math.max(0, endsAt - serverNow());
  el.querySelector('.secs').textContent = `${Math.ceil(left / 1000)}s`;
  return el;
}

// The six hours of the night, with the current one lit (public information).
export function hourTrack(current) {
  return h('ol', { class: 'hour-track', 'aria-label': current ? `Hour ${current} of 6` : 'Hours of the night' },
    [1, 2, 3, 4, 5, 6].map((n) => h('li', {
      class: n === current ? 'now' : current && n < current ? 'past' : '',
    }, String(n))));
}

// What this player knows from the night, for the day screens.
export function nightNotes(view) {
  const { me, night, follower } = view;
  const seen = night.seen;
  const lines = [];
  const line = (ico, ...text) => lines.push(h('li', {}, h('span', { class: 'ico' }, ico), h('span', {}, ...text)));
  if (seen) {
    line('🎲', 'You rolled a ', h('strong', {}, String(me.die)), ` and woke at ${seen.hour} o'clock.`);
    line('👀', seen.companions.length ? `Also awake: ${listNames(view, seen.companions)}.` : 'Nobody else was awake.');
    if (me.role === 'thief') line('🧀', 'You took the cheese.');
    else line(seen.cheeseOnTable ? '🧀' : '🍽️', seen.cheeseOnTable ? 'The cheese was still on the table.' : 'The cheese was already gone!');
    if (seen.thiefId) line('🐭', 'You saw ', h('strong', {}, nameOf(view, seen.thiefId)), ' take the cheese!');
    if (seen.peek) line('🔍', 'You peeked: ', h('strong', {}, nameOf(view, seen.peek.playerId)), ` rolled a ${seen.peek.die}.`);
  } else {
    line('🎲', `You rolled a ${me.die}.`);
  }
  if (follower?.chosenId) line('🤝', 'Your Follower is ', h('strong', {}, nameOf(view, follower.chosenId)), '.');
  if (follower?.isYou) {
    line('🤝', "You are the Thief's Follower. The Thief is ", h('strong', {}, nameOf(view, follower.thiefId)),
      ". You win if the Thief isn't caught.");
  }
  return h('div', { class: 'card notes' },
    h('h3', {}, '📜 Your night', h('span', { class: 'muted small' }, '· only you can see this')),
    h('ul', {}, lines),
  );
}

function speakerIcon(on) {
  const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    svg('path', { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
    ...(on
      ? [svg('path', { ...stroke, d: 'M15.5 9a4 4 0 0 1 0 6' }), svg('path', { ...stroke, d: 'M18 6.5a7.5 7.5 0 0 1 0 11' })]
      : [svg('path', { ...stroke, d: 'M16 9.5l5 5M21 9.5l-5 5' })]),
  ]);
}

export function narrationButton(on, onToggle) {
  return h('button', {
    class: 'icon-btn',
    'aria-label': on ? 'Narration on for this phone. Tap to mute.' : 'Narration off for this phone. Tap to narrate here.',
    'aria-pressed': on ? 'true' : 'false',
    onClick: onToggle,
  }, speakerIcon(on));
}
