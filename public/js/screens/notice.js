// Full-screen notices: room expired, removed by host, seat opened elsewhere, ...

import { h } from '../dom.js';
import { art } from '../components.js';

export function render({ notice, actions }) {
  return h('section', { class: 'screen center' },
    art('plate', 'pop-in'),
    h('div', { class: 'card hero' },
      h('h2', {}, notice.title),
      h('p', { class: 'muted' }, notice.text),
      h('button', { class: 'btn-primary btn-block', onClick: () => actions.dismissNotice() }, notice.action ?? 'Back to start'),
    ),
  );
}
