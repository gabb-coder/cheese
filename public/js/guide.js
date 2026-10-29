// How to play: six illustrated cards you swipe through (or step with Next and Back).
// Opened from the Home screen and the Lobby. The words are in i18n.js under guide.*.
//
// Motion: the guide pops in; each card's picture is a small looping scene (paused while
// the card is out of view); the picture lags behind the text while swiping (parallax); a
// cheese-bar marker slides between the dots; the first time, the card nudges sideways to
// show it can be swiped. Phones that ask for less motion get still pictures.

import { h, calm } from './dom.js';
import { art, avatar, dieFace, woodenCup, sunrise } from './components.js';
import { t } from './i18n.js';
import { prefs } from './storage.js';

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const child of children) el.append(child);
  return el;
}

// The Thief, with eyes drawn on top of the picture's own (same viewBox and positions) so
// they can dart about or wink.
function thief(className = '') {
  const eye = (cx) => svg('ellipse', { cx, cy: 75, rx: 9, ry: 8, fill: '#fff6e3' });
  return h('div', { class: `thief ${className}` },
    art('role-thief'),
    svg('svg', { class: 'thief-eyes', viewBox: '0 0 160 166', 'aria-hidden': 'true' }, [
      eye(62), eye(98),
      svg('g', { class: 'pupils' }, [
        svg('circle', { cx: 64, cy: 76, r: 4.2, fill: '#2b1d14' }),
        svg('circle', { cx: 100, cy: 76, r: 4.2, fill: '#2b1d14' }),
        svg('circle', { cx: 65.5, cy: 74.5, r: 1.4, fill: '#fff' }),
        svg('circle', { cx: 101.5, cy: 74.5, r: 1.4, fill: '#fff' }),
      ]),
      svg('ellipse', { class: 'lid', cx: 98, cy: 75, rx: 10.5, ry: 9.5, fill: '#2b1d14' }),
    ]));
}

// Card 2: the cup shakes, lifts, and the die shows a new number every time round.
function diceScene() {
  let die = 1 + Math.floor(Math.random() * 6);
  const face = h('div', { class: 'loop-die' }, dieFace(die, 46));
  const cup = h('div', { class: 'loop-cup' }, woodenCup());
  cup.addEventListener('animationiteration', () => {
    const next = 1 + Math.floor(Math.random() * 5);
    die = next >= die ? next + 1 : next; // never the same number twice in a row
    face.replaceChildren(dieFace(die, 46));
  });
  return h('div', { class: 'gscene scene-die' }, h('div', { class: 'loop-table' }), face, cup);
}

const SCENES = {
  roles: () => h('div', { class: 'gscene scene-roles' },
    h('div', { class: 'sleeper' }, art('role-sleepy'), ...['z', 'z', 'z'].map((z) => h('span', { class: 'zzz' }, z))),
    thief('shifty')),
  die: diceScene,
  night: () => h('div', { class: 'gscene scene-night' },
    h('div', { class: 'guide-night' }, art('moon'), ...[1, 2, 3].map(() => h('i', { class: 'twinkle' }))),
    h('ol', { class: 'loop-hours', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5, 6].map((n) => h('li', {}, String(n))))),
  steal: () => h('div', { class: 'gscene scene-steal' },
    h('div', { class: 'loop-plate' }, art('plate'), art('cheese', 'loot')),
    thief('sneaker')),
  follower: () => h('div', { class: 'gscene scene-follower' },
    thief('winker'),
    h('div', { class: 'buddy' }, avatar({ id: 'guide-follower' }, 84))),
  vote: () => h('div', { class: 'gscene scene-vote' },
    sunrise('vote-sun'),
    thief('target'),
    ...[1, 2, 3].map((n) => h('span', { class: `vote-arrow a${n}` }, '➜')),
    h('span', { class: 'mini-stamp' }, t('results.caught'))),
};
const KEYS = ['roles', 'die', 'night', 'steal', 'follower', 'vote'];

export function openGuide() {
  document.querySelector('.guide')?.remove();
  let index = 0;

  const pictures = [];
  const slides = KEYS.map((key, i) => {
    const picture = h('div', { class: 'guide-parallax' }, SCENES[key]());
    pictures.push(picture);
    return h('section', {
      class: 'guide-slide',
      'aria-roledescription': 'slide',
      'aria-label': t('guide.step', { n: i + 1, total: KEYS.length }),
    },
    h('div', { class: 'guide-picture' }, picture),
    h('h2', {}, t(`guide.${key}.title`)),
    h('p', {}, t(`guide.${key}.text`)));
  });
  const track = h('div', { class: 'guide-track' }, slides);
  const dots = KEYS.map((_, i) => h('button', {
    class: 'guide-dot', 'aria-label': t('guide.step', { n: i + 1, total: KEYS.length }), onClick: () => go(i),
  }));
  const bar = h('span', { class: 'guide-bar', 'aria-hidden': 'true' });
  const back = h('button', { class: 'btn-secondary', onClick: () => go(index - 1) }, t('guide.back'));
  const next = h('button', { class: 'btn-primary grow', onClick: () => (index === KEYS.length - 1 ? close() : go(index + 1)) });

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
  };
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    if (calm()) {
      overlay.remove();
      return;
    }
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 220);
  };
  const overlay = h('div', { class: 'guide', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('guide.title') },
    h('div', { class: 'guide-box card' },
      h('div', { class: 'row' }, h('h3', { class: 'grow' }, t('guide.title')),
        h('button', { class: 'guide-close', 'aria-label': t('guide.close'), onClick: close }, '✕')),
      track,
      h('div', { class: 'guide-dots' }, dots, bar),
      h('div', { class: 'row' }, back, next)));

  // Keep the dots, buttons and the active card in step with the card in view.
  const show = () => {
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
    slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
    back.disabled = index === 0;
    next.textContent = index === KEYS.length - 1 ? t('guide.done') : t('guide.next');
  };
  // Follow the swipe frame by frame: parallax pictures and the sliding cheese bar.
  const STEP = 18; // px between dots: 10px dot + 8px gap
  const follow = () => {
    const width = Math.max(1, track.clientWidth);
    const progress = track.scrollLeft / width;
    if (!calm()) {
      pictures.forEach((picture, i) => {
        picture.style.transform = `translateX(${(-0.4 * (i - progress) * width).toFixed(1)}px)`;
      });
    }
    const stretch = Math.sin(Math.PI * (progress - Math.floor(progress)));
    const barWidth = 24 + 14 * stretch;
    bar.style.width = `${barWidth}px`;
    bar.style.transform = `translateX(${(progress * STEP + 5 - barWidth / 2).toFixed(1)}px)`;
  };
  let frame = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(follow);
    const i = Math.min(KEYS.length - 1, Math.max(0, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
    if (i !== index) {
      index = i;
      show();
    }
  }, { passive: true });

  function go(i) {
    if (i < 0 || i >= KEYS.length) return;
    index = i;
    track.scrollTo({ left: i * track.clientWidth, behavior: calm() ? 'auto' : 'smooth' });
    show();
  }

  show();
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  follow();
  next.focus();

  // The first time, nudge the card sideways once to show it can be swiped.
  // (An animation, not a scroll: the cards snap into place and would cancel a scroll.)
  if (!prefs.guideSeen) {
    track.classList.add('nudge');
    track.addEventListener('pointerdown', () => track.classList.remove('nudge'), { once: true });
  }
  prefs.guideSeen = true;
}
