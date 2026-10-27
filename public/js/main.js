// App entry: owns the socket, the latest view from the server, and which screen shows.
// The server sends this player's complete view after every change, so the client just
// renders the newest one. There is no game logic here.

import { Connection } from './net.js';
import { session, prefs } from './storage.js';
import { h, toast } from './dom.js';
import * as connecting from './screens/connecting.js';
import * as home from './screens/home.js';
import * as lobby from './screens/lobby.js';
import * as game from './screens/game.js';
import * as notice from './screens/notice.js';

const SCREENS = { connecting, home, lobby, game, notice };

const NOTICES = {
  expired: { title: 'Room expired', text: 'That room has gone to sleep. Create a new one!' },
  serverRestart: { title: 'Room expired', text: 'The server restarted, so the room was cleared. Create a new one!' },
  empty: { title: 'Room closed', text: 'Everyone left the room.' },
  seatGone: { title: 'Seat not found', text: 'Your seat in that room is gone. Join again with the room code.' },
  kicked: { title: 'Removed from room', text: 'The host removed you from the room.' },
  replaced: {
    title: 'Playing somewhere else',
    text: 'You opened your seat on another tab or device.',
    action: 'Play on this device',
  },
};

const app = document.getElementById('app');
const conn = new Connection();
const state = {
  status: conn.status,
  view: null,
  notice: null, // key of NOTICES
  homeError: '',
  pendingHello: false,
  attempts: 0,
};

// ---------------------------------------------------------------------------
// Actions screens can call

const actions = {
  send(msg) {
    if (!conn.send(msg)) toast('Reconnecting… try again in a moment');
  },
  create(name) {
    prefs.name = name;
    state.homeError = '';
    actions.send({ t: 'create', name });
  },
  join(room, name) {
    prefs.name = name;
    state.homeError = '';
    actions.send({ t: 'join', room, name });
  },
  leave() {
    actions.send({ t: 'leave' });
  },
  dismissNotice() {
    const key = state.notice;
    state.notice = null;
    if (key === 'replaced') hello();
    else setRoomInUrl(null);
    render();
  },
};

function hello() {
  const saved = session.get();
  if (!saved?.room || !saved?.token) return false;
  state.pendingHello = conn.send({ t: 'hello', room: saved.room, token: saved.token });
  return state.pendingHello;
}

function forgetRoom(noticeKey) {
  session.clear();
  state.view = null;
  state.pendingHello = false;
  state.notice = noticeKey ?? null;
}

function setRoomInUrl(room) {
  const url = new URL(location.href);
  if (room) url.searchParams.set('r', room);
  else url.searchParams.delete('r');
  history.replaceState(null, '', url);
}

// ---------------------------------------------------------------------------
// Socket events

conn.addEventListener('status', ({ detail }) => {
  state.status = detail;
  if (detail === 'open') {
    state.attempts = 0;
    hello();
  } else if (detail === 'connecting') {
    state.attempts += 1;
  }
  render();
});

conn.addEventListener('message', ({ detail: msg }) => {
  switch (msg.t) {
    case 'welcome':
      session.set({ room: msg.room, token: msg.token, playerId: msg.playerId });
      setRoomInUrl(msg.room);
      return;
    case 'view':
      state.view = msg;
      state.pendingHello = false;
      break;
    case 'left':
      forgetRoom();
      setRoomInUrl(null);
      break;
    case 'roomClosed':
      forgetRoom(NOTICES[msg.reason] ? msg.reason : 'expired');
      break;
    case 'error':
      handleError(msg);
      break;
    default:
      return;
  }
  render();
});

function handleError(msg) {
  if (msg.for === 'hello') {
    forgetRoom(msg.code === 'SEAT_NOT_FOUND' ? 'seatGone' : 'expired');
  } else if (msg.code === 'KICKED') {
    forgetRoom('kicked');
  } else if (msg.code === 'REPLACED') {
    state.view = null;
    state.notice = 'replaced';
  } else if (msg.for === 'create' || msg.for === 'join') {
    state.homeError = msg.message;
  } else {
    toast(msg.message);
  }
}

// ---------------------------------------------------------------------------
// Rendering

let current = null;
let banner = null;

function screenName() {
  if (state.notice) return 'notice';
  if (state.view) return state.view.phase.name === 'LOBBY' ? 'lobby' : 'game';
  if (state.status !== 'open' || state.pendingHello) return 'connecting';
  return 'home';
}

function render() {
  const name = screenName();
  const ctx = { state, actions, notice: NOTICES[state.notice] };
  const screen = SCREENS[name];
  if (current === name && screen.update) {
    screen.update(ctx);
  } else {
    app.replaceChildren(screen.render(ctx));
    current = name;
  }

  // Mid-game drop: keep the screen, show that we're reconnecting.
  const showBanner = Boolean(state.view) && state.status !== 'open';
  if (showBanner && !banner) {
    banner = h('div', { class: 'banner', role: 'status' }, h('span', { class: 'dots' }, 'Reconnecting'));
    document.body.append(banner);
  } else if (!showBanner && banner) {
    banner.remove();
    banner = null;
  }
}

render();
conn.connect();
