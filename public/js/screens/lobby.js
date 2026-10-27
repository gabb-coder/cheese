// Lobby: room code and share link, who's here, host controls (kick, bots, start).

import { h, toast } from '../dom.js';

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
    h('summary', {}, '⚙️ Game settings'),
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

export function render({ state, actions }) {
  const view = state.view;
  const meId = view.me.id;
  const isHost = view.room.hostId === meId;
  const players = view.players;
  const host = players.find((p) => p.isHost);
  const count = players.length;

  const list = h('ul', { class: 'players' }, players.map((p) =>
    h('li', { class: `player${p.connected ? '' : ' offline'}` },
      h('span', { class: 'name' }, p.isHost ? '👑 ' : '', p.name),
      p.id === meId ? h('span', { class: 'badge you' }, 'you') : null,
      p.connected ? null : h('span', { class: 'badge' }, 'offline'),
      isHost && p.id !== meId
        ? h('button', {
          class: 'kick',
          'aria-label': `Remove ${p.name}`,
          onClick: () => {
            if (p.isBot) actions.send({ t: 'removeBot', playerId: p.id });
            else if (confirm(`Remove ${p.name} from the room?`)) actions.send({ t: 'kick', playerId: p.id });
          },
        }, '✕')
        : null,
    )));

  const need = MIN_PLAYERS - count;
  const hostControls = isHost
    ? [
      view.room.botsEnabled && count < MAX_PLAYERS
        ? h('button', { class: 'btn-secondary btn-block', onClick: () => actions.send({ t: 'addBot' }) }, '🤖 Add a bot')
        : null,
      h('button', {
        class: 'btn-primary btn-block',
        disabled: need > 0,
        onClick: () => actions.send({ t: 'start' }),
      }, need > 0 ? `Need ${need} more player${need === 1 ? '' : 's'}` : 'Start the game'),
    ]
    : h('p', { class: 'muted hero' }, h('span', { class: 'dots' }, `Waiting for ${host?.name ?? 'the host'} to start`));

  return h('section', { class: 'screen' },
    h('div', { class: 'hero' },
      h('img', { class: 'logo small', src: 'img/logo.svg', alt: '' }),
      h('p', { class: 'muted small' }, 'Room code'),
      h('div', { class: 'room-code', 'aria-label': `Room code ${view.room.code.split('').join(' ')}` }, view.room.code),
      h('button', { class: 'btn-secondary btn-small', onClick: () => shareLink(view.room.code) }, '🔗 Share invite link'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Mice in the house'), h('span', { class: 'muted' }, `${count}/${MAX_PLAYERS}`)),
      list,
    ),
    settingsCard(view, isHost, actions),
    h('div', { class: 'grow' }),
    hostControls,
    h('button', { class: 'btn-ghost', onClick: () => actions.leave() }, 'Leave room'),
  );
}
