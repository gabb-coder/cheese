// Role reveal: hold the card to see your role and die, then confirm.

import { h } from '../dom.js';
import { holdCard, countdown } from '../components.js';
import { wakeLockSupported } from '../cues.js';

let progress = null;

export const key = (view) => String(view.reveal.doneIds.includes(view.me.id));

export function render({ state, actions }) {
  const view = state.view;
  const done = view.reveal.doneIds.includes(view.me.id);
  progress = h('p', { class: 'muted small hero' });
  update({ state });
  return h('section', { class: 'screen-inner' },
    h('h1', { class: 'hero' }, 'Your secret role'),
    holdCard(view.me),
    done
      ? h('p', { class: 'hero' }, h('span', { class: 'dots' }, 'Waiting for the others'))
      : h('button', { class: 'btn-primary btn-block', onClick: () => actions.send({ t: 'revealed' }) }, "I've memorized it ✓"),
    progress,
    countdown(view.phase.endsAt, 'Night falls in'),
    wakeLockSupported ? null : h('p', { class: 'muted small hero' }, 'Tip: keep your screen on during the night.'),
  );
}

export function update({ state }) {
  const view = state.view;
  progress.textContent = `${view.reveal.doneIds.length} of ${view.players.length} ready`;
}
