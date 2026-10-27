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
    h('div', { class: 'grow' }),
    hostControls,
    h('button', { class: 'btn-ghost', onClick: () => actions.leave() }, 'Leave room'),
  );
}
