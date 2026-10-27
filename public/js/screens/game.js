// In-game router: picks the screen for the current phase and only rebuilds it when
// something this player can see has changed (so a held card or an open picker isn't
// reset just because someone else reconnected).

import { h } from '../dom.js';
import { narrationButton } from '../components.js';
import { narratesHere, lineFor } from '../narrator.js';
import * as reveal from './reveal.js';
import * as night from './night.js';
import * as day from './day.js';

const NIGHT = new Set(['NIGHT_INTRO', 'HOUR', 'FOLLOWER_CHOICE', 'FOLLOWER_MEET', 'DAWN']);

function screenFor(view) {
  if (view.phase.name === 'ROLE_REVEAL') return reveal;
  if (NIGHT.has(view.phase.name)) return night;
  return day;
}

let lastKey = null;
let body = null;
let current = null;
let narrBtnSlot = null;
let caption = null;

export function render(ctx) {
  lastKey = null;
  narrBtnSlot = h('div', { class: 'topbar-right' });
  caption = h('p', { class: 'caption', 'aria-live': 'polite' });
  body = h('div', { class: 'game-body' });
  const root = h('div', { class: 'game' },
    h('div', { class: 'topbar' }, h('span', { class: 'room-pill' }, `ROOM ${ctx.state.view.room.code}`), narrBtnSlot),
    caption,
    body,
  );
  update(ctx);
  return root;
}

export function update(ctx) {
  const view = ctx.state.view;
  const screen = screenFor(view);
  const key = `${view.phase.name}|${screen.key(view)}`;
  if (key !== lastKey || screen !== current) {
    body.replaceChildren(screen.render(ctx));
    lastKey = key;
    current = screen;
    caption.textContent = lineFor(view);
  } else {
    screen.update?.(ctx);
  }
  narrBtnSlot.replaceChildren(narrationButton(narratesHere(view), () => ctx.actions.toggleNarration()));
}
