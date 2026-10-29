// How to play: six illustrated cards you swipe through (or step with Next and Back).
// Opened from the Home screen and the Lobby. The words are in i18n.js under guide.*.

import { h, calm } from './dom.js';
import { art, dieFace, woodenCup } from './components.js';
import { t } from './i18n.js';

const SLIDES = [
  { key: 'roles', picture: () => h('div', { class: 'guide-pair' }, art('role-sleepy'), art('role-thief')) },
  { key: 'die', picture: () => h('div', { class: 'guide-cup' }, h('div', { class: 'cup-art' }, woodenCup()), dieFace(4, 52)) },
  { key: 'night', picture: () => h('div', { class: 'guide-night' }, art('moon')) },
  { key: 'steal', picture: () => h('div', { class: 'guide-pair' }, art('role-thief'), art('plate')) },
  { key: 'follower', picture: () => art('pair') },
  { key: 'vote', picture: () => art('sun') },
];

export function openGuide() {
  document.querySelector('.guide')?.remove();
  let index = 0;

  const slides = SLIDES.map(({ key, picture }, i) => h('section', {
    class: 'guide-slide',
    'aria-roledescription': 'slide',
    'aria-label': t('guide.step', { n: i + 1, total: SLIDES.length }),
  },
  h('div', { class: 'guide-picture' }, picture()),
  h('h2', {}, t(`guide.${key}.title`)),
  h('p', {}, t(`guide.${key}.text`))));
  const track = h('div', { class: 'guide-track' }, slides);
  const dots = SLIDES.map((_, i) => h('button', {
    class: 'guide-dot', 'aria-label': t('guide.step', { n: i + 1, total: SLIDES.length }), onClick: () => go(i),
  }));
  const back = h('button', { class: 'btn-secondary', onClick: () => go(index - 1) }, t('guide.back'));
  const next = h('button', { class: 'btn-primary grow', onClick: () => (index === SLIDES.length - 1 ? close() : go(index + 1)) });

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const overlay = h('div', { class: 'guide', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('guide.title') },
    h('div', { class: 'guide-box card' },
      h('div', { class: 'row' }, h('h3', { class: 'grow' }, t('guide.title')),
        h('button', { class: 'guide-close', 'aria-label': t('guide.close'), onClick: close }, '✕')),
      track,
      h('div', { class: 'guide-dots' }, dots),
      h('div', { class: 'row' }, back, next)));

  // Keep the dots and buttons in step with the card in view, however it got there.
  const show = () => {
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
    back.disabled = index === 0;
    next.textContent = index === SLIDES.length - 1 ? t('guide.done') : t('guide.next');
  };
  function go(i) {
    if (i < 0 || i >= SLIDES.length) return;
    index = i;
    track.scrollTo({ left: i * track.clientWidth, behavior: calm() ? 'auto' : 'smooth' });
    show();
  }
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== index) {
      index = Math.min(SLIDES.length - 1, Math.max(0, i));
      show();
    }
  }, { passive: true });

  show();
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  next.focus();
}
