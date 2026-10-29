// Home: pick a name, then create a room or join one with a code (or a ?r=CODE link).

import { h } from '../dom.js';
import { art, peekingMouse, settingsButton } from '../components.js';
import { t, lang } from '../i18n.js';
import { prefs } from '../storage.js';
import { VERSES, NOTICES } from '../verses.js';

let errorEl = null;

export function render({ state, actions }) {
  const codeFromLink = (new URLSearchParams(location.search).get('r') ?? '').toUpperCase().slice(0, 4);

  const name = h('input', {
    type: 'text', id: 'name', maxlength: 16, autocomplete: 'nickname', enterkeyhint: 'done',
    placeholder: t('home.namePlaceholder'), value: prefs.name,
  });
  const code = h('input', {
    type: 'text', id: 'code', class: 'code', maxlength: 4, autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, enterkeyhint: 'go', placeholder: '····', value: codeFromLink, 'aria-label': t('home.roomCode'),
    onInput: () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); },
  });
  errorEl = h('p', { class: 'error-text', role: 'alert' });

  const needName = () => {
    const value = name.value.trim();
    if (!value) {
      errorEl.textContent = t('home.needName');
      name.focus();
      return null;
    }
    return value;
  };
  const create = () => {
    const n = needName();
    if (n) actions.create(n);
  };
  const join = () => {
    const n = needName();
    if (!n) return;
    if (code.value.length !== 4) {
      errorEl.textContent = t('home.codeLength');
      code.focus();
      return;
    }
    actions.join(code.value, n);
  };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

  const createBtn = h('button', { class: codeFromLink ? 'btn-secondary btn-block' : 'btn-primary btn-block', onClick: create },
    t('home.create'));
  const joinBtn = h('button', { class: codeFromLink ? 'btn-primary' : 'btn-secondary', onClick: join }, t('home.join'));
  const joinRow = h('div', { class: 'row' }, h('div', { class: 'grow' }, code), joinBtn);

  update({ state });
  return h('section', { class: 'screen home' },
    h('div', { class: 'corner' }, settingsButton({ onLanguage: actions.setLanguage })),
    h('div', { class: 'hero' },
      art('logo', 'logo bob'),
      h('h1', { class: 'title' }, t('home.titleA'), h('span', { class: 'accent' }, t('home.titleB'))),
      h('p', { class: 'tagline' }, t('home.tagline')),
    ),
    h('div', { class: 'card' },
      h('label', { for: 'name' }, t('home.name')),
      name,
      ...(codeFromLink
        ? [h('label', { for: 'code' }, t('home.roomCode')), joinRow, h('div', { class: 'divider' }, t('home.or')), createBtn]
        : [createBtn, h('div', { class: 'divider' }, t('home.orJoin')), joinRow]),
    ),
    errorEl,
    h('p', { class: 'footnote' }, t('home.footnote')),
    verseMouse(),
  );
}

export function update({ state }) {
  if (state.homeError) errorEl.textContent = state.homeError;
}

// Easter egg: tap the mouse in the corner for a Bible verse, a different one every tap.
// Verses come round in a shuffled order, so none repeats until all have been shown.
let deck = [];
let lastShown = -1;

function nextVerse() {
  if (!deck.length) {
    deck = VERSES.map((_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (deck[deck.length - 1] === lastShown) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
  }
  lastShown = deck.pop();
  return VERSES[lastShown];
}

// Verse text with its printed line breaks (CSS) and small capitals (⟪LORD⟫).
const verseText = (text) => text.split(/(⟪[^⟫]*⟫)/).filter(Boolean)
  .map((part) => (part.startsWith('⟪') ? h('span', { class: 'sc' }, part.slice(1, -1)) : part));

function verseMouse() {
  const mouse = h('button', { class: 'home-hole', 'aria-label': t('verse.open'), 'aria-expanded': 'false' },
    peekingMouse('', { wall: false }));
  let bubble = null;
  const close = () => {
    bubble?.remove();
    bubble = null;
    mouse.classList.remove('awake', 'hop');
    mouse.setAttribute('aria-expanded', 'false');
  };
  mouse.addEventListener('click', () => {
    const verse = nextVerse();
    const zh = lang() === 'zh';
    const card = h('div', { class: 'verse-bubble', role: 'status' },
      h('button', { class: 'verse-close', 'aria-label': t('verse.close'), onClick: close }, '✕'),
      h('blockquote', { lang: zh ? 'zh-CN' : 'en' }, verseText(zh ? verse.zh : verse.en)),
      h('p', { class: 'verse-ref' }, t('verse.ref', { ref: zh ? verse.zhRef : verse.ref })),
      h('p', { class: 'verse-hint' }, t('verse.tapAgain')),
      h('p', { class: 'verse-notice' }, NOTICES[zh ? 'zh' : 'en']));
    if (bubble) bubble.replaceWith(card);
    else mouse.after(card);
    bubble = card;
    // The mouse pops out of its hole, with a little hop on every tap.
    mouse.classList.remove('hop');
    void mouse.offsetWidth;
    mouse.classList.add('awake', 'hop');
    mouse.setAttribute('aria-expanded', 'true');
  });
  return mouse;
}
