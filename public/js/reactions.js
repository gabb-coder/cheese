// Quick emoji reactions during the day: a row of buttons, and each reaction floats up the
// screen of every phone with the mouse of the player who sent it. The server only passes
// them on during discussion, the vote and the results (never at night).

import { h, calm } from './dom.js';
import { avatar } from './components.js';
import { t } from './i18n.js';

export const REACTIONS = ['🤔', '😱', '😂', '🙄', '🧀', '👉'];
export const REACT_PHASES = new Set(['DISCUSSION', 'VOTE', 'RESULTS']);
const MAX_ON_SCREEN = 12;

export function reactionBar(send) {
  return h('div', { class: 'react-bar', role: 'group', 'aria-label': t('react.bar') },
    REACTIONS.map((emoji) => h('button', {
      class: 'react-btn',
      'aria-label': t('react.aria', { emoji }),
      onClick: (e) => {
        send({ t: 'react', emoji });
        e.currentTarget.classList.remove('tapped');
        void e.currentTarget.offsetWidth; // restart the squish
        e.currentTarget.classList.add('tapped');
      },
    }, emoji)));
}

let layer = null;
export function showReaction(view, from, emoji) {
  if (!REACTIONS.includes(emoji)) return;
  const player = view?.players.find((p) => p.id === from);
  if (!player) return;
  if (!layer?.isConnected) {
    layer = h('div', { class: 'reactions', 'aria-hidden': 'true' });
    document.body.append(layer);
  }
  while (layer.children.length >= MAX_ON_SCREEN) layer.firstChild.remove();
  const bubble = h('div', { class: `reaction${player.id === view.me.id ? ' mine' : ''}` },
    avatar(player, 28), h('span', { class: 'emoji' }, emoji), h('span', { class: 'who' }, player.name));
  bubble.style.setProperty('--x', `${8 + Math.random() * 62}%`);
  bubble.style.setProperty('--sway', `${(Math.random() - 0.5) * 60}px`);
  bubble.style.setProperty('--tilt', `${(Math.random() - 0.5) * 16}deg`);
  layer.append(bubble);
  setTimeout(() => bubble.remove(), calm() ? 2200 : 3000);
}

export function clearReactions() {
  layer?.replaceChildren();
}
