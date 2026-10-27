// Home: pick a name, then create a room or join one with a code (or a ?r=CODE link).

import { h } from '../dom.js';
import { art, peekingMouse, settingsButton } from '../components.js';
import { t } from '../i18n.js';
import { prefs } from '../storage.js';

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
  return h('section', { class: 'screen' },
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
    h('div', { class: 'home-hole', 'aria-hidden': 'true' }, peekingMouse('', { wall: false })),
  );
}

export function update({ state }) {
  if (state.homeError) errorEl.textContent = state.homeError;
}
