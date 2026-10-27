// Reusable pieces for the game screens. Everything here renders only data that is
// already in this player's own view.

import { h } from './dom.js';
import { serverNow } from './clock.js';

const SVG = 'http://www.w3.org/2000/svg';

// Switching apps or locking the phone always hides an open card.
document.addEventListener('visibilitychange', () => {
  for (const card of document.querySelectorAll('.hold-card.open')) card.classList.remove('open');
});

export function nameOf(view, id) {
  return view.players.find((p) => p.id === id)?.name ?? 'someone';
}

export function listNames(view, ids) {
  const names = ids.map((id) => nameOf(view, id));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// A die showing `n` pips (original SVG).
const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export function dieFace(n, size = 88) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', 'die');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `a die showing ${n}`);
  const rect = document.createElementNS(SVG, 'rect');
  for (const [k, v] of Object.entries({ x: 4, y: 4, width: 92, height: 92, rx: 20, fill: '#fff4d6', stroke: '#e0a100', 'stroke-width': 4 })) {
    rect.setAttribute(k, v);
  }
  svg.append(rect);
  for (const [cx, cy] of PIPS[n] ?? []) {
    const pip = document.createElementNS(SVG, 'circle');
    pip.setAttribute('cx', cx);
    pip.setAttribute('cy', cy);
    pip.setAttribute('r', 9);
    pip.setAttribute('fill', '#2a1d00');
    svg.append(pip);
  }
  return svg;
}

const ROLE_INFO = {
  thief: {
    art: '🐭🧀',
    title: 'You are the Cheese Thief!',
    hint: 'On your hour, take the cheese. After hour 6 you choose a Follower. Win by not getting the most votes.',
  },
  sleepyhead: {
    art: '😴',
    title: 'You are a Sleepyhead',
    hint: 'Wake up on your hour and see what you can. Then find the Thief and vote them out!',
  },
};

// Press and hold to see your role and die; let go and it hides (PLAN.md §8).
export function holdCard(me, { compact = false } = {}) {
  const info = ROLE_INFO[me.role];
  const secret = h('div', { class: 'secret' },
    h('div', { class: 'role-art' }, info.art),
    h(compact ? 'h3' : 'h2', {}, info.title),
    h('div', { class: 'die-row' }, dieFace(me.die, compact ? 56 : 88),
      h('p', {}, 'You wake at ', h('strong', {}, `${me.die} o'clock`))),
    compact ? null : h('p', { class: 'muted small' }, info.hint),
  );
  const cover = h('div', { class: 'cover' },
    h('div', { class: 'role-art' }, '🤫'),
    h('strong', {}, compact ? 'Hold to see your card' : 'Press and hold to peek'),
    compact ? null : h('p', { class: 'muted small' }, 'Make sure nobody else can see your screen.'),
  );
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
  if (seen) {
    lines.push(`You rolled a ${me.die} and woke at ${seen.hour} o'clock.`);
    lines.push(seen.companions.length ? `Also awake: ${listNames(view, seen.companions)}.` : 'Nobody else was awake.');
    if (me.role === 'thief') lines.push('You took the cheese. 🧀');
    else lines.push(seen.cheeseOnTable ? 'The cheese was still on the table. 🧀' : 'The cheese was already gone! 🍽️');
    if (seen.thiefId) lines.push(`👀 You saw ${nameOf(view, seen.thiefId)} take the cheese!`);
    if (seen.peek) lines.push(`🎲 You peeked: ${nameOf(view, seen.peek.playerId)} rolled a ${seen.peek.die}.`);
  } else {
    lines.push(`You rolled a ${me.die}.`);
  }
  if (follower?.chosenId) lines.push(`🤝 Your Follower is ${nameOf(view, follower.chosenId)}.`);
  if (follower?.isYou) lines.push(`🤝 You are the Follower. The Thief is ${nameOf(view, follower.thiefId)}. You win if the Thief isn't caught.`);
  return h('div', { class: 'card notes' },
    h('h3', {}, 'Your night (only you can see this)'),
    h('ul', {}, lines.map((line) => h('li', {}, line))),
  );
}

export function narrationButton(on, onToggle) {
  return h('button', {
    class: 'icon-btn',
    'aria-label': on ? 'Narration on for this phone. Tap to mute.' : 'Narration off for this phone. Tap to narrate here.',
    'aria-pressed': on ? 'true' : 'false',
    onClick: onToggle,
  }, on ? '🔊' : '🔇');
}
