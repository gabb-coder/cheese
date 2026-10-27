// Reusable pieces for the game screens. Everything here renders only data that is
// already in this player's own view.

import { h } from './dom.js';
import { serverNow } from './clock.js';
import { t, tx, joinList, LANGS, lang } from './i18n.js';
import { testVoice } from './narrator.js';

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
  return view.players.find((p) => p.id === id)?.name ?? t('someone');
}

export function listNames(view, ids) {
  return joinList(ids.map((id) => nameOf(view, id)));
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

function hashOf(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

export function avatar(player, size = 48) {
  const hash = hashOf(player.id);
  const [face, ear] = FURS[hash % FURS.length];
  const ink = '#2b1d14';
  const earAt = (cx, side) => svg('g', { class: `ear ear-${side}` }, [
    svg('circle', { cx, cy: 20, r: 12, fill: ear, stroke: ink, 'stroke-width': 2.5 }),
    svg('circle', { cx, cy: 20, r: 6.5, fill: '#f4a7b9' }),
  ]);
  const parts = [earAt(16, 'l'), earAt(48, 'r')];
  if (player.isBot) {
    parts.push(svg('path', { d: 'M32 20 V8', stroke: ink, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    parts.push(svg('circle', { cx: 32, cy: 7, r: 3.5, fill: '#ffc23d', stroke: ink, 'stroke-width': 2 }));
  }
  parts.push(svg('ellipse', { cx: 32, cy: 38, rx: 20, ry: 18, fill: face, stroke: ink, 'stroke-width': 2.5 }));
  parts.push(svg('g', { class: 'eyes' }, player.isBot
    ? [svg('rect', { x: 22, y: 32, width: 6, height: 6, rx: 1.5, fill: ink }),
      svg('rect', { x: 36, y: 32, width: 6, height: 6, rx: 1.5, fill: ink })]
    : [svg('circle', { cx: 25, cy: 35, r: 3, fill: ink }),
      svg('circle', { cx: 39, cy: 35, r: 3, fill: ink }),
      svg('circle', { cx: 26, cy: 34, r: 1, fill: '#fff' }),
      svg('circle', { cx: 40, cy: 34, r: 1, fill: '#fff' })]));
  parts.push(svg('ellipse', { cx: 20.5, cy: 43, rx: 3.6, ry: 2.1, fill: '#f4a7b9', opacity: 0.8 }));
  parts.push(svg('ellipse', { cx: 43.5, cy: 43, rx: 3.6, ry: 2.1, fill: '#f4a7b9', opacity: 0.8 }));
  parts.push(svg('circle', { cx: 32, cy: 43, r: 2.8, fill: '#ef7f9c', stroke: ink, 'stroke-width': 1.5 }));

  const el = h('span', { class: `avatar${player.isHost ? ' host' : ''}`, 'aria-hidden': 'true' });
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  // Each mouse blinks and twitches at its own pace, the same on every phone.
  el.style.setProperty('--blink', `${4 + (hash % 5) * 0.8}s`);
  el.style.setProperty('--twitch', `${7 + ((hash >>> 3) % 6)}s`);
  el.style.setProperty('--delay', `-${(hash >>> 6) % 9}s`);
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
    viewBox: '0 0 100 100', width: size, height: size, class: 'die', role: 'img', 'aria-label': t('die.aria', { n }),
  }, [
    svg('rect', { x: 5, y: 5, width: 90, height: 90, rx: 22, fill: '#fff6e3', stroke: '#2b1d14', 'stroke-width': 6 }),
    ...(PIPS[n] ?? []).map(([cx, cy]) => svg('circle', { cx, cy, r: 9, fill: '#2b1d14' })),
  ]);
}

const ROLE_ART = { thief: 'role-thief', sleepyhead: 'role-sleepy' };

// Press and hold to see your role and die; let go and it hides (PLAN.md §8).
export function holdCard(me, { compact = false } = {}) {
  const role = (part) => t(`role.${me.role}.${part}`);
  const secret = compact
    ? h('div', { class: 'face secret' },
      art(ROLE_ART[me.role], 'role-art'),
      h('div', { class: 'grow' }, h('h3', {}, role('short')), h('p', { class: 'small' }, t('card.wakeAt', { hour: me.die }))),
      dieFace(me.die, 48))
    : h('div', { class: 'face secret' },
      art(ROLE_ART[me.role], 'role-art'),
      h('h2', {}, role('title')),
      h('div', { class: 'die-row' }, dieFace(me.die, 60),
        h('span', {}, t('card.wakeAtLabel'), h('br'), h('strong', {}, t('card.oclock', { hour: me.die })))),
      h('p', { class: 'small' }, role('hint')));
  const cover = compact
    ? h('div', { class: 'face cover' }, h('span', { class: 'badge-pill' }, t('card.holdCompact')))
    : h('div', { class: 'face cover' },
      art('logo', 'logo small'),
      h('span', { class: 'badge-pill' }, t('card.hold')),
      h('span', { class: 'hint' }, t('card.noLooking')));
  const card = h('div', {
    class: `hold-card${compact ? ' compact' : ''}`,
    tabindex: 0,
    role: 'button',
    'aria-label': t('card.aria'),
  }, h('div', { class: 'flip' }, cover, secret));

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
  el.querySelector('.secs').textContent = t('unit.secShort', { n: Math.ceil(left / 1000) });
  return el;
}

// The six hours of the night, with the current one lit (public information).
export function hourTrack(current) {
  return h('ol', { class: 'hour-track', 'aria-label': current ? t('hours.aria', { n: current }) : t('hours.ariaAll') },
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
  const strong = (text) => h('strong', {}, String(text));
  if (seen) {
    line('🎲', tx('notes.rolledWoke', { die: strong(me.die), hour: seen.hour }));
    line('👀', seen.companions.length ? t('notes.alsoAwake', { names: listNames(view, seen.companions) }) : t('notes.nobody'));
    if (me.role === 'thief') line('🧀', t('notes.took'));
    else line(seen.cheeseOnTable ? '🧀' : '🍽️', t(seen.cheeseOnTable ? 'notes.onTable' : 'notes.gone'));
    if (seen.thiefId) line('🐭', tx('notes.sawThief', { name: strong(nameOf(view, seen.thiefId)) }));
    if (seen.peek) line('🔍', tx('notes.peeked', { name: strong(nameOf(view, seen.peek.playerId)), die: seen.peek.die }));
  } else {
    line('🎲', t('notes.rolled', { die: me.die }));
  }
  if (follower?.chosenId) line('🤝', tx('notes.yourFollower', { name: strong(nameOf(view, follower.chosenId)) }));
  if (follower?.isYou) line('🤝', tx('notes.youFollow', { name: strong(nameOf(view, follower.thiefId)) }));
  return h('div', { class: 'card notes' },
    h('h3', {}, t('notes.title'), h('span', { class: 'muted small' }, t('notes.private'))),
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
    'aria-label': t(on ? 'narr.on' : 'narr.off'),
    'aria-pressed': on ? 'true' : 'false',
    onClick: onToggle,
  }, speakerIcon(on));
}

// A mouse that pops up in its mouse hole, looks left and right, and ducks back down.
// Without the wall it's just the hole, for setting into the bottom edge of a screen.
let holeIds = 0;
export function peekingMouse(className = '', { wall = true } = {}) {
  const ink = '#2b1d14';
  const hole = 'M60 128 V96 A40 40 0 0 1 140 96 V128 Z';
  const clipId = `mousehole-${++holeIds}`;
  const ear = (cx) => [
    svg('circle', { cx, cy: 86, r: 12, fill: '#d6b08c', stroke: ink, 'stroke-width': 3 }),
    svg('circle', { cx, cy: 86, r: 6, fill: '#f4a7b9' }),
  ];
  const mouse = svg('g', { class: 'peek-mouse' }, [
    ...ear(80), ...ear(120),
    svg('ellipse', { cx: 100, cy: 110, rx: 25, ry: 21, fill: '#e8cdb0', stroke: ink, 'stroke-width': 3 }),
    svg('circle', { cx: 90, cy: 104, r: 5.5, fill: '#fff' }),
    svg('circle', { cx: 110, cy: 104, r: 5.5, fill: '#fff' }),
    svg('g', { class: 'peek-eyes' }, [
      svg('circle', { cx: 90, cy: 105, r: 3, fill: ink }),
      svg('circle', { cx: 110, cy: 105, r: 3, fill: ink }),
    ]),
    svg('ellipse', { cx: 100, cy: 116, rx: 4, ry: 3, fill: '#ef7f9c', stroke: ink, 'stroke-width': 1.5 }),
    svg('path', { d: 'M92 117 l-14 -3 M92 120 l-14 2 M108 117 l14 -3 M108 120 l14 2', stroke: ink, 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
  ]);
  const scene = [
    svg('path', { d: hole, fill: ink }),
    svg('clipPath', { id: clipId }, [svg('path', { d: hole })]),
    svg('g', { 'clip-path': `url(#${clipId})` }, [mouse]),
    svg('path', { d: 'M60 128 V96 A40 40 0 0 1 140 96 V128', fill: 'none', stroke: '#7a5536', 'stroke-width': 5 }),
  ];
  if (wall) {
    scene.unshift(
      svg('rect', { x: 0, y: 0, width: 200, height: 132, rx: 10, fill: '#e9d3ae' }),
      svg('path', { d: 'M0 34 H200 M0 70 H200 M0 106 H200 M50 0 V34 M140 0 V34 M95 34 V70 M20 70 V106 M170 70 V106 M120 106 V132', stroke: '#d9bf95', 'stroke-width': 2 }),
    );
    scene.push(svg('rect', { x: 0, y: 126, width: 200, height: 24, rx: 4, fill: '#a8774f', stroke: ink, 'stroke-width': 3 }));
  }
  return svg('svg', {
    viewBox: wall ? '0 0 200 150' : '52 50 96 79', class: `art peeker ${className}`, role: 'img', 'aria-label': t('art.peeker'),
  }, scene);
}

// The dawn sun, drawn inline so it can rise from behind the hill.
export function sunrise(className = '') {
  const ink = '#2b1d14';
  const line = { fill: 'none', stroke: ink, 'stroke-width': 3.5, 'stroke-linecap': 'round' };
  return svg('svg', { viewBox: '0 0 160 120', class: `art sunrise ${className}`, role: 'img', 'aria-label': t('art.sunrise') }, [
    svg('g', { class: 'sun-body' }, [
      svg('g', { class: 'rays', stroke: '#e59a12', 'stroke-width': 6, 'stroke-linecap': 'round' }, [
        svg('path', { d: 'M80 10 v14' }), svg('path', { d: 'M30 30 l10 10' }), svg('path', { d: 'M130 30 l-10 10' }),
        svg('path', { d: 'M10 74 h14' }), svg('path', { d: 'M136 74 h14' }),
      ]),
      svg('circle', { cx: 80, cy: 78, r: 38, fill: '#ffc23d', stroke: ink, 'stroke-width': 4 }),
      svg('path', { ...line, d: 'M64 74 q6 -6 12 0 M84 74 q6 -6 12 0' }),
      svg('path', { ...line, d: 'M70 88 q10 8 20 0' }),
    ]),
    svg('path', { d: 'M0 120 V100 Q40 82 80 96 Q120 110 160 92 V120 Z', fill: '#8fbf86', stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }),
  ]);
}

// Settings: a gear button that opens a sheet where this phone picks its language.
function gearIcon() {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => svg('rect', {
    x: 10.25, y: 1.5, width: 3.5, height: 5, rx: 1, fill: 'currentColor', transform: `rotate(${deg} 12 12)`,
  }));
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    ...teeth,
    svg('circle', { cx: 12, cy: 12, r: 6.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 3.2 }),
  ]);
}

// `narration` and `music` are { on, set(on) } when in a room, so this phone can turn them on or off.
export function settingsButton({ onLanguage, narration = null, music = null }) {
  return h('button', { class: 'icon-btn', 'aria-label': t('settings.open'), onClick: () => openSettings(onLanguage, narration, music) }, gearIcon());
}

// An On/Off pair for a { on, set } setting.
function onOff(setting) {
  let on = setting.on;
  return choices([[true, t('settings.on')], [false, t('settings.off')]], (v) => v === on, (v) => {
    on = v;
    setting.set(v);
  });
}

function choices(items, isOn, onPick) {
  const buttons = items.map(([value, label, attrs = {}]) => h('button', {
    class: 'choice', 'aria-pressed': String(isOn(value)), ...attrs,
    onClick: () => {
      onPick(value);
      for (const [i, b] of buttons.entries()) b.setAttribute('aria-pressed', String(isOn(items[i][0])));
    },
  }, label));
  return h('div', { class: 'choices' }, buttons);
}

function openSettings(onLanguage, narration, music) {
  document.querySelector('.sheet-backdrop')?.remove();
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const languages = choices(LANGS.map((l) => [l.code, l.label, { lang: l.speech }]), (code) => code === lang(), (code) => {
    if (code === lang()) return;
    close();
    onLanguage(code);
  });
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: (e) => { if (e.target === backdrop) close(); } },
    h('div', { class: 'card sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('settings.title') },
      h('h2', {}, t('settings.title')),
      h('div', { class: 'label' }, t('settings.language')),
      languages,
      h('div', { class: 'label' }, t('settings.narrator')),
      narration ? h('p', { class: 'small' }, t('settings.narrateHere')) : null,
      narration ? onOff(narration) : null,
      h('button', { class: 'btn-secondary btn-small', onClick: () => testVoice() }, t('narr.test')),
      music ? h('div', { class: 'label' }, t('settings.music')) : null,
      music ? h('p', { class: 'small' }, t('settings.musicHere')) : null,
      music ? onOff(music) : null,
      h('button', { class: 'btn-primary btn-block', onClick: close }, t('settings.done'))));
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  languages.querySelector('[aria-pressed="true"]')?.focus();
}
