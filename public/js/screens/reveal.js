// Role reveal: hold the card to see your role and die, then confirm.

import { h } from '../dom.js';
import { holdCard, countdown, avatar } from '../components.js';
import { wakeLockSupported } from '../cues.js';

let ready = null;

export const key = (view) => String(view.reveal.doneIds.includes(view.me.id));

export function render({ state, actions }) {
  const view = state.view;
  const done = view.reveal.doneIds.includes(view.me.id);
  ready = h('div', { class: 'avatars', 'aria-label': 'Who is ready' });
  update({ state });
  return h('section', { class: 'screen-inner' },
    h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, 'Your secret card'), h('h1', {}, 'Who are you tonight?')),
    holdCard(view.me),
    done
      ? h('p', { class: 'center' }, h('span', { class: 'dots' }, 'Waiting for the others'))
      : h('button', { class: 'btn-primary btn-block btn-big', onClick: () => actions.send({ t: 'revealed' }) }, "I've memorized it"),
    ready,
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Night falls in'),
    wakeLockSupported ? null : h('p', { class: 'muted small center' }, 'Tip: keep your screen on during the night.'),
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
