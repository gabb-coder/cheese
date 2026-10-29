// Lobby: room code and share link, who's here, host controls (kick, bots, start).

import { h, toast, calm } from '../dom.js';
import { avatar, settingsButton, qrButton } from '../components.js';
import { openGuide } from '../guide.js';
import { t, duration } from '../i18n.js';
import { narratesHere, musicHere, testVoice } from '../narrator.js';

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;

function shareLink(code) {
  const url = `${location.origin}/?r=${code}`;
  if (navigator.share) {
    navigator.share({ title: t('app.title'), text: t('lobby.shareText', { code }), url }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(url).then(
    () => toast(t('lobby.copied')),
    () => toast(url, 6000),
  ) ?? toast(url, 6000);
}

const DEBUG = new URLSearchParams(location.search).has('debug');
const FAST = { hourSec: 5, followerChoiceSec: 10, discussionSec: 30, voteSec: 15 };
let settingsOpen = false;

function select(key, value, choices, onChange) {
  const id = `set-${key}`;
  // Keep the current value selectable even if it isn't one of the presets (e.g. fast timers).
  const all = choices.includes(value) ? choices : [value, ...choices];
  const el = h('select', { id, onChange: () => onChange(Number(el.value)) },
    all.map((v) => h('option', { value: String(v), selected: v === value }, duration(v))));
  return h('div', { class: 'setting' }, h('label', { for: id }, t(`rules.${key}`)), el);
}

function settingsCard(view, isHost, actions) {
  const s = view.room.settings;
  const set = (patch) => actions.send({ t: 'settings', settings: patch });
  if (!isHost) {
    return h('p', { class: 'muted small hero' },
      t('rules.summary', { hour: duration(s.hourSec), discussion: duration(s.discussionSec), vote: duration(s.voteSec) }));
  }
  const details = h('details', { class: 'card settings', open: settingsOpen },
    h('summary', {}, t('rules.title')),
    select('hour', s.hourSec, [10, 15, 20, 30], (v) => set({ hourSec: v })),
    select('follower', s.followerChoiceSec, [15, 20, 30], (v) => set({ followerChoiceSec: v })),
    select('discussion', s.discussionSec, [60, 120, 180, 300, 480], (v) => set({ discussionSec: v })),
    select('vote', s.voteSec, [30, 45, 60], (v) => set({ voteSec: v })),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: s.narratorOnHost, onChange: (e) => set({ narratorOnHost: e.target.checked }) }),
      ` ${t('rules.narrate')}`),
    h('p', { class: 'muted small' }, t('rules.narrateHelp')),
    DEBUG ? h('button', { class: 'btn-secondary btn-small', onClick: () => set(FAST) }, t('rules.fast')) : null,
  );
  // The lobby re-renders on every change; keep the panel open if the host opened it.
  details.addEventListener('toggle', () => { settingsOpen = details.open; });
  return details;
}

// Which phone reads the script aloud, with a button to check this phone can be heard.
function narratorCard(view) {
  const host = view.players.find((p) => p.id === view.room.hostId);
  if (narratesHere(view)) {
    return h('div', { class: 'card narrator-card' }, h('p', {}, t('lobby.narratorHere')),
      h('button', { class: 'btn-secondary btn-small', onClick: () => testVoice() }, t('narr.test')));
  }
  return h('div', { class: 'card narrator-card' },
    h('p', { class: 'muted' }, view.room.settings.narratorOnHost && host && host.id !== view.me.id ? t('lobby.narratorThere', { name: host.name }) : t('lobby.narratorOff')));
}

// The room code flips into place like a departure board the first time it's shown.
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
let flippedCode = null;

function roomCode(code) {
  const flaps = code.split('').map((ch) => h('span', { class: 'flap', 'aria-hidden': 'true' }, ch));
  const el = h('div', { class: 'room-code', role: 'img', 'aria-label': t('lobby.codeAria', { code: code.split('').join(' ') }), 'data-code': code }, flaps);
  if (code !== flippedCode && !calm()) {
    flaps.forEach((flap, i) => {
      const stopAt = Date.now() + 450 + i * 260;
      const tick = () => {
        const done = Date.now() >= stopAt;
        flap.textContent = done ? code[i] : LETTERS[Math.floor(Math.random() * LETTERS.length)];
        flap.animate(done
          ? [{ transform: 'rotateX(-80deg)' }, { transform: 'rotateX(20deg)' }, { transform: 'none' }]
          : [{ transform: 'rotateX(-70deg)' }, { transform: 'none' }], { duration: done ? 340 : 60, easing: 'ease-out' });
        if (!done) setTimeout(tick, 100);
      };
      setTimeout(tick, i * 35);
    });
  }
  flippedCode = code;
  return el;
}

// Who was in the lobby last time it was drawn, so arrivals bounce in, leavers shrink
// away and a crown that changes heads wiggles.
let shown = { code: null, players: new Map(), hostId: null };

export function render({ state, actions }) {
  const view = state.view;
  const meId = view.me.id;
  const isHost = view.room.hostId === meId;
  const players = view.players;
  const host = players.find((p) => p.isHost);
  const count = players.length;

  const prev = shown.code === view.room.code ? shown : null;
  shown = { code: view.room.code, players: new Map(players.map((p) => [p.id, p])), hostId: view.room.hostId };
  const crownMoved = prev && prev.hostId !== view.room.hostId;
  const hostAvatar = (p) => {
    const a = avatar(p, 44);
    if (crownMoved && p.isHost) a.classList.add('crown-new');
    return a;
  };

  const seatFor = (p) => h('li', { class: `seat${p.connected ? '' : ' offline'}${p.id === meId ? ' me' : ''}` },
    hostAvatar(p),
    // Wins so far in this room, on the corner of the mouse.
    view.room.scores?.[p.id] ? h('span', { class: 'seat-wins' }, t('lobby.wins', { n: view.room.scores[p.id].wins })) : null,
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, p.name),
      h('div', { class: 'sub' }, [p.id === meId ? t('lobby.you') : null, p.isHost ? t('lobby.host') : null, p.isBot ? t('lobby.bot') : null,
        p.connected ? null : t('lobby.offline')].filter(Boolean).join(' · ') || '\u00a0')),
    isHost && p.id !== meId
      ? h('button', {
        class: 'kick',
        'aria-label': t('lobby.remove', { name: p.name }),
        onClick: () => {
          if (p.isBot) actions.send({ t: 'removeBot', playerId: p.id });
          else if (confirm(t('lobby.confirmRemove', { name: p.name }))) actions.send({ t: 'kick', playerId: p.id });
        },
      }, '✕')
      : null);

  const seat = (p, i) => {
    const li = seatFor(p);
    if (!prev) {
      li.classList.add('intro');
      li.style.setProperty('--i', i);
    } else if (!prev.players.has(p.id)) {
      li.classList.add('arrive');
    }
    return li;
  };
  const leavers = prev && !calm() ? [...prev.players.values()].filter((p) => !shown.players.has(p.id)) : [];
  const ghost = (p) => {
    const li = h('li', { class: 'seat leaving', 'aria-hidden': 'true' }, avatar(p, 44), h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name)));
    setTimeout(() => li.remove(), 400);
    return li;
  };

  // Empty chairs up to the 4 needed to start, then one "room for more" chair.
  const empty = [];
  const missing = Math.max(0, MIN_PLAYERS - count);
  for (let i = 0; i < missing; i++) empty.push(h('li', { class: 'seat empty' }, t('lobby.emptySeat')));
  if (!missing && count < MAX_PLAYERS) empty.push(h('li', { class: 'seat empty' }, t('lobby.roomFor', { n: MAX_PLAYERS - count })));

  const need = MIN_PLAYERS - count;
  const actionsBar = h('div', { class: 'actions' },
    isHost && view.room.botsEnabled && count < MAX_PLAYERS
      ? h('button', { class: 'btn-secondary btn-block', onClick: () => actions.send({ t: 'addBot' }) }, t('lobby.addBot'))
      : null,
    isHost
      ? h('button', { class: 'btn-primary btn-block btn-big', disabled: need > 0, onClick: () => actions.send({ t: 'start' }) },
        need > 0 ? t('lobby.need', { n: need }) : t('lobby.start'))
      : h('p', { class: 'muted center' }, h('span', { class: 'dots' }, t('lobby.waiting', { name: host?.name ?? t('lobby.theHost') }))),
    h('button', { class: 'btn-ghost', onClick: () => openGuide() }, t('guide.open')),
    h('button', { class: 'btn-ghost', onClick: () => actions.leave() }, t('lobby.leave')),
  );

  return h('section', { class: 'screen' },
    h('div', { class: 'lobby-head' },
      h('div', { class: 'ticket' },
        h('div', { class: 'label' }, t('lobby.roomCode')),
        roomCode(view.room.code),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn-secondary btn-small', onClick: () => shareLink(view.room.code) }, t('lobby.invite')),
        qrButton(view.room.code),
        settingsButton({ onLanguage: actions.setLanguage, narration: { on: narratesHere(view), set: actions.setNarration },
          music: { on: musicHere(view), set: actions.setMusic } })),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('h2', { class: 'grow' }, t('lobby.mice')), h('span', { class: 'chip' }, `${count} / ${MAX_PLAYERS}`)),
      h('ul', { class: 'seats' }, players.map(seat), leavers.map(ghost), empty),
    ),
    narratorCard(view),
    settingsCard(view, isHost, actions),
    actionsBar,
  );
}
