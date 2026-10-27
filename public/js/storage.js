// localStorage wrapper. Storage can be unavailable (private mode, blocked site data),
// so every access is guarded and the app still works without it (minus reconnect).
//
// Debug: ?debug=1&seat=2 gives this tab its own storage namespace, so several tabs on
// one computer can be different players.

const params = new URLSearchParams(location.search);
const seat = params.has('debug') && params.get('seat') ? `:seat${params.get('seat').replace(/\W/g, '')}` : '';
const KEY = (name) => `cheese:${name}${seat}`;

function read(name) {
  try {
    return JSON.parse(localStorage.getItem(KEY(name)));
  } catch {
    return null;
  }
}

function write(name, value) {
  try {
    if (value === null) localStorage.removeItem(KEY(name));
    else localStorage.setItem(KEY(name), JSON.stringify(value));
  } catch {
    // Storage blocked: carry on without it.
  }
}

export const session = {
  get: () => read('session'), // { room, token, playerId }
  set: (value) => write('session', value),
  clear: () => write('session', null),
};

export const prefs = {
  get name() { return read('name') ?? ''; },
  set name(value) { write('name', value); },
  get narration() { return read('narration'); },
  set narration(value) { write('narration', value); },
  get music() { return read('music'); },
  set music(value) { write('music', value); },
  get lang() { return read('lang'); },
  set lang(value) { write('lang', value); },
};
