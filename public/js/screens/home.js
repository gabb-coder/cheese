// Home: pick a name, then create a room or join one with a code (or a ?r=CODE link).

import { h } from '../dom.js';
import { art, peekingMouse } from '../components.js';
import { prefs } from '../storage.js';

let errorEl = null;

export function render({ state, actions }) {
  const codeFromLink = (new URLSearchParams(location.search).get('r') ?? '').toUpperCase().slice(0, 4);

  const name = h('input', {
    type: 'text', id: 'name', maxlength: 16, autocomplete: 'nickname', enterkeyhint: 'done',
    placeholder: 'e.g. Big Cheese', value: prefs.name,
  });
  const code = h('input', {
    type: 'text', id: 'code', class: 'code', maxlength: 4, autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, enterkeyhint: 'go', placeholder: '····', value: codeFromLink, 'aria-label': 'Room code',
    onInput: () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); },
  });
  errorEl = h('p', { class: 'error-text', role: 'alert' });

  const needName = () => {
    const value = name.value.trim();
    if (!value) {
      errorEl.textContent = 'Pick a name first.';
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
      errorEl.textContent = 'Room codes have 4 letters.';
      code.focus();
      return;
    }
    actions.join(code.value, n);
  };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

  const createBtn = h('button', { class: codeFromLink ? 'btn-secondary btn-block' : 'btn-primary btn-block', onClick: create },
    'Create a room');
  const joinBtn = h('button', { class: codeFromLink ? 'btn-primary' : 'btn-secondary', onClick: join }, 'Join');
  const joinRow = h('div', { class: 'row' }, h('div', { class: 'grow' }, code), joinBtn);

  update({ state });
  return h('section', { class: 'screen' },
    h('div', { class: 'hero' },
      art('logo', 'logo bob'),
      h('h1', { class: 'title' }, 'Cheese ', h('span', { class: 'accent' }, 'Thief')),
      h('p', { class: 'tagline' }, 'Someone in the mouse house is after the cheese. Who woke up when?'),
    ),
    h('div', { class: 'card' },
      h('label', { for: 'name' }, 'Your name'),
      name,
      ...(codeFromLink
        ? [h('label', { for: 'code' }, 'Room code'), joinRow, h('div', { class: 'divider' }, 'or'), createBtn]
        : [createBtn, h('div', { class: 'divider' }, 'or join friends'), joinRow]),
    ),
    errorEl,
    h('p', { class: 'footnote' }, '4–8 players · one phone each'),
    h('div', { class: 'home-hole', 'aria-hidden': 'true' }, peekingMouse('', { wall: false })),
  );
}

export function update({ state }) {
  if (state.homeError) errorEl.textContent = state.homeError;
}
