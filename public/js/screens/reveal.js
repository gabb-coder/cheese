// Role reveal: hold the card to see your role and die, then confirm.

import { h } from '../dom.js';
import { holdCard, countdown, avatar } from '../components.js';
import { wakeLockSupported } from '../cues.js';
import { t } from '../i18n.js';

let ready = null;

export const key = (view) => String(view.reveal.doneIds.includes(view.me.id));

export function render({ state, actions }) {
  const view = state.view;
  const done = view.reveal.doneIds.includes(view.me.id);
  ready = h('div', { class: 'avatars', 'aria-label': t('reveal.readyAria') });
  update({ state });
  return h('section', { class: 'screen-inner' },
    h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, t('reveal.eyebrow')), h('h1', {}, t('reveal.title'))),
    holdCard(view.me),
    done
      ? h('p', { class: 'center' }, h('span', { class: 'dots' }, t('reveal.waiting')))
      : h('button', { class: 'btn-primary btn-block btn-big', onClick: () => actions.send({ t: 'revealed' }) }, t('reveal.done')),
    ready,
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, t('reveal.nightIn')),
    wakeLockSupported ? null : h('p', { class: 'muted small center' }, t('reveal.tip')),
  );
}

export function update({ state }) {
  const view = state.view;
  ready.replaceChildren(...view.players.map((p) => {
    const a = avatar(p, 34);
    if (view.reveal.doneIds.includes(p.id)) a.classList.add('done');
    a.title = p.name;
    return a;
  }));
}
