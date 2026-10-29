// In-game router: picks the screen for the current phase and only rebuilds it when
// something this player can see has changed (so a held card or an open picker isn't
// reset just because someone else reconnected).

import { h, swap } from '../dom.js';
import { narrationButton, settingsButton } from '../components.js';
import { t } from '../i18n.js';
import { narratesHere, musicHere, lineFor } from '../narrator.js';
import * as reveal from './reveal.js';
import * as night from './night.js';
import * as day from './day.js';

const NIGHT = new Set(['NIGHT_INTRO', 'HOUR', 'FOLLOWER_CHOICE', 'FOLLOWER_CHECK', 'FOLLOWER_MEET', 'DAWN']);

function screenFor(view) {
  if (view.phase.name === 'ROLE_REVEAL') return reveal;
  if (NIGHT.has(view.phase.name)) return night;
  return day;
}

let lastKey = null;
let lastStep = null;
let body = null;
let current = null;
let narrBtnSlot = null;
let caption = null;

export function render(ctx) {
  lastKey = null;
  lastStep = null;
  narrBtnSlot = h('div', { class: 'topbar-right' });
  caption = h('p', { class: 'caption', 'aria-live': 'polite' });
  body = h('div', { class: 'game-body' });
  const root = h('div', { class: 'game' },
    h('div', { class: 'topbar' }, h('span', { class: 'room-pill' }, t('game.room', { code: ctx.state.view.room.code })), narrBtnSlot),
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
    // A new step of the game slides in; smaller changes within a step just redraw.
    const step = `${view.phase.name}|${view.phase.hour ?? ''}`;
    swap(body, screen.render(ctx), lastStep !== null && step !== lastStep);
    lastStep = step;
    lastKey = key;
    current = screen;
    caption.textContent = lineFor(view);
  } else {
    screen.update?.(ctx);
  }
  narrBtnSlot.replaceChildren(narrationButton(narratesHere(view), () => ctx.actions.toggleNarration()),
    settingsButton({ onLanguage: ctx.actions.setLanguage, narration: { on: narratesHere(view), set: ctx.actions.setNarration },
      music: { on: musicHere(view), set: ctx.actions.setMusic },
      onEndGame: view.room.hostId === view.me.id ? () => ctx.actions.send({ t: 'endGame' }) : null }));
}
