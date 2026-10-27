// Day phases (discussion, vote, results). The full screens arrive in Milestone 4; for now
// this shows the phase, its timer, and the player's private night notes.

import { h } from '../dom.js';
import { countdown, nightNotes, holdCard } from '../components.js';

export const key = (view) => JSON.stringify([view.night, view.follower ?? null]);

const TITLES = { DISCUSSION: '☀️ Time to talk', VOTE: '🗳️ Time to vote', RESULTS: '🏁 Results' };

export function render({ state }) {
  const view = state.view;
  return h('section', { class: 'screen-inner' },
    h('h1', { class: 'hero' }, TITLES[view.phase.name] ?? view.phase.name),
    nightNotes(view),
    h('p', { class: 'muted small hero' }, 'The discussion, voting and results screens arrive in the next milestone.'),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt),
    holdCard(view.me, { compact: true }),
  );
}
