// Shown while the socket connects. On Render's free tier the first connection after a
// quiet spell can take up to a minute while the server wakes, so say so.
// Also shown while this phone rebuilds its room after a server restart.

import { h } from '../dom.js';
import { peekingMouse } from '../components.js';
import { t } from '../i18n.js';

let title = null;
let hint = null;
let retry = null;
let stop = null;

export function render(ctx) {
  title = h('span', { class: 'dots' });
  hint = h('p', { class: 'muted' });
  retry = h('button', { class: 'btn-secondary btn-small', hidden: true, onClick: () => ctx.actions.reconnect() }, t('connecting.retry'));
  stop = h('button', { class: 'btn-ghost btn-small', hidden: true, onClick: () => ctx.actions.stopRejoin() }, t('rejoin.stop'));
  update(ctx);
  return h('section', { class: 'screen center' },
    peekingMouse('pop-in'),
    h('h2', {}, title),
    hint,
    retry,
    stop,
  );
}

export function update({ state }) {
  const rejoining = state.rejoining;
  title.textContent = t(rejoining ? 'rejoin.title' : 'connecting.title');
  if (rejoining) hint.textContent = t('rejoin.text', { code: rejoining.code });
  else hint.textContent = state.attempts >= 2 ? t('connecting.slow') : t('connecting.normal');
  retry.hidden = Boolean(rejoining) || state.attempts < 4;
  stop.hidden = !rejoining;
}
