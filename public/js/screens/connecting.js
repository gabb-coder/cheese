// Shown while the socket connects. On Render's free tier the first connection after a
// quiet spell can take up to a minute while the server wakes, so say so.

import { h } from '../dom.js';

let hint = null;

export function render(ctx) {
  hint = h('p', { class: 'muted small' });
  update(ctx);
  return h('section', { class: 'screen center' },
    h('img', { class: 'logo bob', src: 'img/logo.svg', alt: '' }),
    h('h2', {}, h('span', { class: 'dots' }, 'Waking up the mouse hole')),
    hint,
  );
}

export function update({ state }) {
  hint.textContent = state.attempts >= 2
    ? "The server naps when nobody's playing. This can take up to a minute; we'll keep trying."
    : 'Connecting to the game server.';
}
