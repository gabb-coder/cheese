// Full-screen notices: room expired, removed by host, seat opened elsewhere, ...

import { h } from '../dom.js';

export function render({ notice, actions }) {
  return h('section', { class: 'screen center' },
    h('img', { class: 'logo', src: 'img/logo.svg', alt: '' }),
    h('h2', {}, notice.title),
    h('p', { class: 'muted' }, notice.text),
    h('button', { class: 'btn-primary', onClick: () => actions.dismissNotice() }, notice.action ?? 'Back to start'),
  );
}
