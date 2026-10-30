// App entry: owns the socket, the latest view from the server, and which screen shows.
// The server sends this player's complete view after every change, so the client just
// renders the newest one. There is no game logic here.

import { Connection } from './net.js';
import { session, prefs, lastRoom } from './storage.js';
import { h, toast, swap } from './dom.js';
import { syncServerTime, startCountdowns } from './clock.js';
import { stepKey, lineFor, narratesHere, musicHere, toggleNarration, speak, unlockSpeech, startCountdown, stopCountdown } from './narrator.js';
import { unlockAudio, audioContext, chime, buzz, wantWakeLock, retryWakeLock } from './cues.js';
import { initMusic, setMusic, trackFor } from './music.js';
import { t, setLang, errorText } from './i18n.js';
import * as connecting from './screens/connecting.js';
import * as home from './screens/home.js';
import * as lobby from './screens/lobby.js';
import * as game from './screens/game.js';
import * as notice from './screens/notice.js';

const SCREENS = { connecting, home, lobby, game, notice };

// Full-screen notices; the text is in i18n.js under notice.<key>.
const NOTICES = new Set(['expired', 'serverRestart', 'empty', 'seatGone', 'kicked', 'replaced']);

function noticeText(key) {
  if (!key) return null;
  return {
    title: t(`notice.${key}.title`),
    text: t(`notice.${key}.text`),
    action: key === 'replaced' ? t('notice.replaced.action') : t('notice.back'),
  };
}

const app = document.getElementById('app');
const conn = new Connection();
const state = {
  status: conn.status,
  view: null,
  notice: null, // key of NOTICES
  homeError: '',
  pendingHello: false,
  attempts: 0,
  freshConnection: false, // the next view is the catch-up after (re)connecting
  rejoining: null, // { ...lastRoom, until } while rebuilding the room after a server restart
};

// ---------------------------------------------------------------------------
// Actions screens can call

const actions = {
  send(msg) {
    if (!conn.send(msg)) toast(t('conn.retrySoon'));
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
  toggleNarration() {
    if (!state.view) return;
    toggleNarration(state.view);
    unlockSpeech();
    unlockAudio();
    syncCountdown(state.view);
    syncMusic(state.view);
    render();
  },
  reconnect() {
    conn.reconnectNow();
  },
  stopRejoin() {
    stopRejoin();
    lastRoom.clear();
    setRoomInUrl(null);
    render();
  },
  setMusic(on) {
    prefs.music = on ? 'on' : 'off';
    unlockAudio();
    syncMusic(state.view);
    render();
  },
  setNarration(on) {
    prefs.narration = on ? 'on' : 'off';
    unlockSpeech();
    unlockAudio();
    syncCountdown(state.view);
    syncMusic(state.view);
    render();
  },
  setLanguage(code) {
    setLang(code);
    // Redraw everything in the new language.
    current = null;
    banner?.remove();
    banner = null;
    render();
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

// The page's colours follow the game's time of day (see css/app.css).
const MOOD_COLOR = { evening: '#141a3f', night: '#05060f', dawn: '#3a3a7c', morning: '#ffe9c8' };
function setMood(mood) {
  document.body.dataset.mood = mood;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', MOOD_COLOR[mood]);
}

// The server restarted (an update, or a crash): rebuild the room from what this phone
// remembers, or join it if another phone got there first. The server only allows this
// shortly after it starts, so a phone may first be talking to the old server: keep trying.
const REMEMBER_MS = 45 * 60 * 1000;
const REJOIN_FOR_MS = 2 * 60 * 1000;
let rejoinTimer = null;

function startRejoin() {
  const saved = lastRoom.get();
  if (!saved?.code || !saved.name || Date.now() - saved.savedAt > REMEMBER_MS) return false;
  state.rejoining = { ...saved, until: Date.now() + REJOIN_FOR_MS };
  setRoomInUrl(saved.code);
  tryRejoin();
  return true;
}

function tryRejoin() {
  clearTimeout(rejoinTimer);
  const r = state.rejoining;
  if (!r) return;
  if (Date.now() > r.until) {
    giveUpRejoin();
    return;
  }
  const { code: room, name, host, settings, bots, round, scores } = r;
  // Not connected yet: the socket's 'open' tries again. Otherwise wait for the answer.
  if (conn.send({ t: 'rejoin', room, name, host, settings, bots, round, scores })) {
    rejoinTimer = setTimeout(tryRejoin, 8000);
  } else {
    rejoinTimer = setTimeout(tryRejoin, Math.max(0, r.until - Date.now()) + 50);
  }
}

function stopRejoin() {
  clearTimeout(rejoinTimer);
  state.rejoining = null;
}

function giveUpRejoin() {
  stopRejoin();
  lastRoom.clear();
  state.notice = 'serverRestart';
  render();
}

function forgetRoom(noticeKey) {
  setMood('evening');
  stopCountdown();
  setMusic(null);
  wantWakeLock(false);
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
    state.freshConnection = true;
    if (!hello()) tryRejoin();
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
      if (state.rejoining) {
        toast(t(state.rejoining.inGame ? 'rejoin.backLost' : 'rejoin.back', { code: msg.room }), 6000);
        stopRejoin();
      }
      return;
    case 'view':
      syncServerTime(msg.serverNow);
      // The catch-up view after reconnecting shouldn't replay narration for a step that
      // may have started long ago.
      onStep(state.freshConnection ? null : state.view, msg);
      if (state.view && !state.freshConnection && msg.room.hostId === msg.me.id && state.view.room.hostId !== msg.me.id) {
        toast(t('conn.nowHost'));
      }
      // Back in the lobby before the results: the host ended the game.
      if (state.view && !state.freshConnection && msg.phase.name === 'LOBBY'
        && !['LOBBY', 'RESULTS'].includes(state.view.phase.name)) {
        toast(t('endGame.ended'), 4000);
      }
      state.freshConnection = false;
      state.view = msg;
      rememberRoom(msg);
      applySavedLook(msg);
      state.pendingHello = false;
      break;
    case 'left':
      forgetRoom();
      lastRoom.clear();
      setRoomInUrl(null);
      break;
    case 'roomClosed':
      if (msg.reason === 'serverRestart') {
        forgetRoom();
        if (startRejoin()) break;
      }
      lastRoom.clear();
      forgetRoom(NOTICES.has(msg.reason) ? msg.reason : 'expired');
      break;
    case 'error':
      handleError(msg);
      break;
    default:
      return;
  }
  render();
});

// What everyone in the room can see, kept in case the server restarts (see startRejoin).
// A game in progress can't come back, so its round isn't counted.
function rememberRoom(view) {
  const names = new Map(view.players.map((p) => [p.id, p.name]));
  const inGame = !['LOBBY', 'RESULTS'].includes(view.phase.name);
  lastRoom.set({
    code: view.room.code,
    name: names.get(view.me.id),
    host: names.get(view.room.hostId),
    settings: view.room.settings,
    bots: view.players.filter((p) => p.isBot).map((p) => p.name),
    round: Math.max(0, view.room.round - (inGame ? 1 : 0)),
    scores: Object.entries(view.room.scores).filter(([id]) => names.has(id))
      .map(([id, s]) => ({ name: names.get(id), wins: s.wins, played: s.played })),
    inGame,
    savedAt: Date.now(),
  });
}

// Bring this phone's saved mouse into each new seat (once per seat).
let lookSentFor = null;
function applySavedLook(view) {
  const look = prefs.look;
  const seat = `${view.room.code}:${view.me.id}`;
  if (view.phase.name !== 'LOBBY' || !look || lookSentFor === seat) return;
  lookSentFor = seat;
  const me = view.players.find((p) => p.id === view.me.id);
  if (me && !me.look) actions.send({ t: 'look', fur: look.fur, hat: look.hat });
}

function handleError(msg) {
  if (msg.for === 'rejoin') {
    if (msg.code === 'SERVER_RESTARTING') {
      // Still the old server: the new one will answer on the next connection.
      clearTimeout(rejoinTimer);
      rejoinTimer = setTimeout(tryRejoin, 2000);
    } else if (msg.code !== 'ALREADY_SEATED') {
      giveUpRejoin();
    }
  } else if (msg.for === 'hello') {
    // The server lost the room (restart, crash, a sleeping server) or rebuilt it without
    // this phone's seat: try to get back in by name.
    const restarted = msg.code === 'ROOM_NOT_FOUND' || msg.code === 'ROOM_RESTARTED';
    forgetRoom();
    if (!(restarted && startRejoin())) {
      lastRoom.clear();
      forgetRoom(msg.code === 'SEAT_NOT_FOUND' ? 'seatGone' : 'expired');
    }
  } else if (msg.code === 'KICKED') {
    lastRoom.clear();
    forgetRoom('kicked');
  } else if (msg.code === 'REPLACED') {
    state.view = null;
    state.notice = 'replaced';
  } else if (msg.for === 'create' || msg.for === 'join') {
    state.homeError = errorText(msg);
  } else {
    toast(errorText(msg));
  }
}

// ---------------------------------------------------------------------------
// Step changes: narration, chimes, vibration, wake lock, night mood

const NIGHT_STEPS = new Set(['NIGHT_INTRO', 'HOUR', 'FOLLOWER_CHOICE', 'FOLLOWER_CHECK', 'FOLLOWER_MEET']);
const DAY_STEPS = new Set(['DISCUSSION', 'VOTE', 'RESULTS']);
const IN_GAME = new Set(['ROLE_REVEAL', ...NIGHT_STEPS, 'DAWN', 'DISCUSSION', 'VOTE']);

function onStep(prev, next) {
  const phase = next.phase.name;
  setMood(NIGHT_STEPS.has(phase) ? 'night' : phase === 'DAWN' ? 'dawn' : DAY_STEPS.has(phase) ? 'morning' : 'evening');
  wantWakeLock(IN_GAME.has(phase));

  syncMusic(next);

  // The hour's countdown follows the step, also after reconnecting mid-hour.
  if (!prev || stepKey(prev) !== stepKey(next)) syncCountdown(next);

  // Only react to a step *change* seen live, not to the first view after (re)connecting.
  if (!prev || stepKey(prev) === stepKey(next)) return;
  if (NIGHT_STEPS.has(phase) || phase === 'DAWN') buzz(); // identical on every phone (D7)
  if (narratesHere(next) && lineFor(next)) {
    chime(phase === 'NIGHT_INTRO' ? 'night' : phase === 'DAWN' || phase === 'RESULTS' ? 'dawn' : 'hour');
    setTimeout(() => speak(lineFor(next)), 600);
  }
}

// The music follows the step of the game, on the phones that play it.
initMusic(audioContext);
function syncMusic(view) {
  setMusic(view && musicHere(view) ? trackFor(view.phase.name) : null);
}

// The narrating phone counts down the last ten seconds of every hour of the night.
function syncCountdown(view) {
  if (view?.phase.name === 'HOUR' && view.phase.endsAt && narratesHere(view)) startCountdown(view.phase.endsAt);
  else stopCountdown();
}

// Browsers only allow sound, speech and vibration after the player has tapped something.
document.addEventListener('pointerdown', () => {
  unlockAudio();
  unlockSpeech();
  retryWakeLock();
}, { passive: true });
// iOS Safari only shows :active (the button squish) when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

// ---------------------------------------------------------------------------
// Rendering

let current = null;
let banner = null;

function screenName() {
  if (state.notice) return 'notice';
  if (state.view) return state.view.phase.name === 'LOBBY' ? 'lobby' : 'game';
  if (state.status !== 'open' || state.pendingHello || state.rejoining) return 'connecting';
  return 'home';
}

function render() {
  const name = screenName();
  const ctx = { state, actions, notice: noticeText(state.notice) };
  const screen = SCREENS[name];
  document.body.dataset.screen = name;
  if (current === name && screen.update) {
    screen.update(ctx);
  } else {
    swap(app, screen.render(ctx), current !== null && current !== name);
    current = name;
  }

  // Mid-game drop: keep the screen, show that we're reconnecting.
  const showBanner = Boolean(state.view) && state.status !== 'open';
  if (showBanner && !banner) {
    banner = h('div', { class: 'banner', role: 'status' }, h('span', { class: 'dots' }, t('conn.reconnecting')));
    document.body.append(banner);
  } else if (!showBanner && banner) {
    banner.remove();
    banner = null;
  }
}

render();
startCountdowns();
conn.connect();

// Cache the app shell so a returning player sees the "waking up" screen at once, even
// while a sleeping server is still starting (needs https or localhost).
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
