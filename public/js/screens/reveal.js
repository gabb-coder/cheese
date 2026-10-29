// Role reveal: first the role card (press and hold to see your role), then the dice cup:
// tap it to shake, then press and hold to lift it and see your number. Then confirm.
//
// The die was rolled by the server when the game was dealt; the cup only shows it to this
// player, so nothing here changes what any other phone receives.

import { h } from '../dom.js';
import { holdCard, countdown, avatar, dieFace, woodenCup } from '../components.js';
import { wakeLockSupported, rattle } from '../cues.js';
import { t } from '../i18n.js';

const SHAKE_MS = 950;

let ready = null;
// This phone's progress through the step, kept across redraws; a new round starts afresh.
let progress = { round: null, stage: 'card', shaken: false };

export const key = (view) => String(view.reveal.doneIds.includes(view.me.id));

export function render({ state, actions }) {
  const view = state.view;
  if (progress.round !== view.phase.endsAt) progress = { round: view.phase.endsAt, stage: 'card', shaken: false };
  const done = view.reveal.doneIds.includes(view.me.id);
  ready = h('div', { class: 'avatars', 'aria-label': t('reveal.readyAria') });
  update({ state });

  const section = h('section', { class: 'screen-inner' });
  const draw = () => {
    const top = progress.stage === 'card' ? cardStage(view, draw) : cupStage(view, done, actions, draw);
    section.replaceChildren(...[...top, ready, h('div', { class: 'grow' }),
      countdown(view.phase.endsAt, t('reveal.nightIn')),
      wakeLockSupported ? null : h('p', { class: 'muted small center' }, t('reveal.tip'))].filter(Boolean));
  };
  draw();
  return section;
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

function cardStage(view, draw) {
  return [
    h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, t('reveal.eyebrow')), h('h1', {}, t('reveal.title'))),
    holdCard(view.me),
    h('button', {
      class: 'btn-primary btn-block btn-big',
      onClick: () => {
        progress.stage = 'cup';
        draw();
      },
    }, t('reveal.next')),
  ];
}

function cupStage(view, done, actions, draw) {
  const instruction = h('p', { class: 'center cup-hint' }, t(progress.shaken ? 'dice.holdToPeek' : 'dice.tapToShake'));
  const confirm = done
    ? h('p', { class: 'center' }, h('span', { class: 'dots' }, t('reveal.waiting')))
    : h('button', { class: 'btn-primary btn-block btn-big', hidden: !progress.shaken, onClick: () => actions.send({ t: 'revealed' }) },
      t('reveal.done'));
  const cup = diceCup(view.me.die, () => {
    instruction.textContent = t('dice.holdToPeek');
    confirm.hidden = false;
  }, () => { instruction.textContent = t('dice.shaking'); });
  return [
    h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, t('dice.eyebrow')), h('h1', {}, t('dice.title'))),
    ...cup,
    instruction,
    confirm,
    h('button', {
      class: 'btn-ghost',
      onClick: () => {
        progress.stage = 'card';
        draw();
      },
    }, t('dice.backToCard')),
  ];
}

// The cup: tap it once to shake; after that, press and hold to lift it and see the die.
function diceCup(die, onShaken, onShaking) {
  const face = h('div', { class: 'cup-die' }, dieFace(die, 64));
  const cup = h('div', { class: 'cup' }, woodenCup());
  const stage = h('div', {
    class: `cup-stage${progress.shaken ? ' shaken' : ''}`,
    role: 'button',
    tabindex: 0,
    'aria-label': t('dice.aria'),
  }, face, cup);
  const wake = h('p', { class: 'cup-wake' }, t('dice.wakeAt', { hour: die }));

  let shaking = false;
  let peeked = false;
  const shake = () => {
    if (progress.shaken || shaking) return;
    shaking = true;
    onShaking();
    rattle(SHAKE_MS / 1000);
    navigator.vibrate?.([40, 60, 40, 60, 40, 60, 80]);
    stage.classList.add('shaking');
    setTimeout(() => {
      shaking = false;
      progress.shaken = true;
      stage.classList.remove('shaking');
      stage.classList.add('shaken', 'landed');
      setTimeout(() => stage.classList.remove('landed'), 320);
      onShaken();
    }, SHAKE_MS);
  };
  const open = (e) => {
    if (!progress.shaken) return;
    e.preventDefault();
    if (!peeked) face.classList.add('fresh'); // the die tumbles the first time it's seen
    peeked = true;
    stage.classList.add('open');
    if (e.pointerId !== undefined) stage.setPointerCapture?.(e.pointerId);
  };
  const close = () => stage.classList.remove('open');

  stage.addEventListener('click', shake);
  stage.addEventListener('pointerdown', open);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) stage.addEventListener(type, close);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (progress.shaken) open(e);
    else shake();
  });
  stage.addEventListener('keyup', close);
  return [stage, wake];
}
