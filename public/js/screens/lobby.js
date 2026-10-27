// Lobby: room code and share link, who's here, host controls (kick, bots, start).

import { h, toast, calm } from '../dom.js';
import { avatar } from '../components.js';

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;

function shareLink(code) {
  const url = `${location.origin}/?r=${code}`;
  if (navigator.share) {
    navigator.share({ title: 'Cheese Thief', text: `Join my Cheese Thief room: ${code}`, url }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(url).then(
    () => toast('Link copied!'),
    () => toast(url, 6000),
  ) ?? toast(url, 6000);
}

const DEBUG = new URLSearchParams(location.search).has('debug');
const FAST = { hourSec: 5, followerChoiceSec: 10, discussionSec: 30, voteSec: 15 };
let settingsOpen = false;

function select(label, value, options, onChange) {
  const id = `set-${label.replace(/\W/g, '')}`;
  const el = h('select', { id, onChange: () => onChange(Number(el.value)) },
    options.map(([v, text]) => h('option', { value: String(v), selected: v === value }, text)));
  // Keep the current value selectable even if it isn't one of the presets (e.g. fast timers).
  if (!options.some(([v]) => v === value)) el.prepend(h('option', { value: String(value), selected: true }, `${value} s`));
  return h('div', { class: 'setting' }, h('label', { for: id }, label), el);
}

function settingsCard(view, isHost, actions) {
  const s = view.room.settings;
  const set = (patch) => actions.send({ t: 'settings', settings: patch });
  const mins = (sec) => (sec % 60 ? `${sec} s` : `${sec / 60} min`);
  if (!isHost) {
    return h('p', { class: 'muted small hero' },
      `${s.hourSec} s per hour · ${mins(s.discussionSec)} discussion · ${s.voteSec} s to vote`);
  }
  const details = h('details', { class: 'card settings', open: settingsOpen },
    h('summary', {}, '⚙️  Game settings'),
    select('Each hour', s.hourSec, [[10, '10 s'], [15, '15 s'], [20, '20 s'], [30, '30 s']], (v) => set({ hourSec: v })),
    select('Thief picks a Follower', s.followerChoiceSec, [[15, '15 s'], [20, '20 s'], [30, '30 s']], (v) => set({ followerChoiceSec: v })),
    select('Discussion', s.discussionSec, [[60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min'], [480, '8 min']],
      (v) => set({ discussionSec: v })),
    select('Voting', s.voteSec, [[30, '30 s'], [45, '45 s'], [60, '60 s']], (v) => set({ voteSec: v })),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: s.narratorOnHost, onChange: (e) => set({ narratorOnHost: e.target.checked }) }),
      ' Narrate out loud on my phone'),
    h('p', { class: 'muted small' }, 'Any player can also switch narration on or off for their own phone with 🔊 during the game.'),
    DEBUG ? h('button', { class: 'btn-secondary btn-small', onClick: () => set(FAST) }, '⚡ Fast timers (testing)') : null,
  );
  // The lobby re-renders on every change; keep the panel open if the host opened it.
  details.addEventListener('toggle', () => { settingsOpen = details.open; });
  return details;
}

// The room code flips into place like a departure board the first time it's shown.
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
let flippedCode = null;

function roomCode(code) {
  const flaps = code.split('').map((ch) => h('span', { class: 'flap', 'aria-hidden': 'true' }, ch));
  const el = h('div', { class: 'room-code', role: 'img', 'aria-label': `Room code ${code.split('').join(' ')}`, 'data-code': code }, flaps);
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
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, p.name),
      h('div', { class: 'sub' }, [p.id === meId ? 'you' : null, p.isHost ? 'host' : null, p.isBot ? 'bot' : null,
        p.connected ? null : 'offline'].filter(Boolean).join(' · ') || '\u00a0')),
    isHost && p.id !== meId
      ? h('button', {
        class: 'kick',
        'aria-label': `Remove ${p.name}`,
        onClick: () => {
          if (p.isBot) actions.send({ t: 'removeBot', playerId: p.id });
          else if (confirm(`Remove ${p.name} from the room?`)) actions.send({ t: 'kick', playerId: p.id });
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
  for (let i = 0; i < missing; i++) empty.push(h('li', { class: 'seat empty' }, 'waiting for a mouse…'));
  if (!missing && count < MAX_PLAYERS) empty.push(h('li', { class: 'seat empty' }, `room for ${MAX_PLAYERS - count} more`));

  const need = MIN_PLAYERS - count;
  const actionsBar = h('div', { class: 'actions' },
    isHost && view.room.botsEnabled && count < MAX_PLAYERS
      ? h('button', { class: 'btn-secondary btn-block', onClick: () => actions.send({ t: 'addBot' }) }, '🤖  Add a bot')
      : null,
    isHost
      ? h('button', { class: 'btn-primary btn-block btn-big', disabled: need > 0, onClick: () => actions.send({ t: 'start' }) },
        need > 0 ? `Need ${need} more ${need === 1 ? 'mouse' : 'mice'}` : 'Start the game')
      : h('p', { class: 'muted center' }, h('span', { class: 'dots' }, `Waiting for ${host?.name ?? 'the host'} to start`)),
    h('button', { class: 'btn-ghost', onClick: () => actions.leave() }, 'Leave room'),
  );

  return h('section', { class: 'screen' },
    h('div', { class: 'lobby-head' },
      h('div', { class: 'ticket' },
        h('div', { class: 'label' }, 'ROOM CODE'),
        roomCode(view.room.code),
      ),
      h('button', { class: 'btn-secondary btn-small', onClick: () => shareLink(view.room.code) }, '🔗  Invite friends'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('h2', { class: 'grow' }, 'Mice in the house'), h('span', { class: 'chip' }, `${count} / ${MAX_PLAYERS}`)),
      h('ul', { class: 'seats' }, players.map(seat), leavers.map(ghost), empty),
    ),
    settingsCard(view, isHost, actions),
    actionsBar,
  );
}
