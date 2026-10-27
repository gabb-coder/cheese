// Placeholder for the in-game screens (role reveal, night, day) which arrive in
// Milestones 3 and 4. Deliberately shows no role or die yet.

import { h } from '../dom.js';

export function render({ state }) {
  const view = state.view;
  return h('section', { class: 'screen center' },
    h('img', { class: 'logo bob', src: 'img/logo.svg', alt: '' }),
    h('h2', {}, 'The game has started!'),
    h('p', { class: 'muted' }, `Room ${view.room.code} · ${view.players.length} players`),
    h('p', { class: 'muted small' }, 'Role reveal and the night arrive in the next milestone.'),
  );
}
