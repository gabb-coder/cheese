// Shown while the socket connects. On Render's free tier the first connection after a
// quiet spell can take up to a minute while the server wakes, so say so.

import { h } from '../dom.js';
import { peekingMouse } from '../components.js';
import { t } from '../i18n.js';

let hint = null;
let retry = null;

export function render(ctx) {
  hint = h('p', { class: 'muted' });
  retry = h('button', { class: 'btn-secondary btn-small', hidden: true, onClick: () => ctx.actions.reconnect() }, t('connecting.retry'));
  update(ctx);
  return h('section', { class: 'screen center' },
    peekingMouse('pop-in'),
    h('h2', {}, h('span', { class: 'dots' }, t('connecting.title'))),
    hint,
    retry,
  );
}

export function update({ state }) {
  hint.textContent = state.attempts >= 2
    ? t('connecting.slow')
    : t('connecting.normal');
  retry.hidden = state.attempts < 4;
}
