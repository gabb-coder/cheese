// The automated moderator: one fixed line per game step (PLAN.md D8).
// Every phone shows the line as a caption. Only narrating phones speak it: by default the
// host's (if the host setting is on), and anyone can switch their own phone on or off.

import { prefs } from './storage.js';
import { t, speechLang } from './i18n.js';
import { toast } from './dom.js';
import { serverNow } from './clock.js';

export function stepKey(view) {
  return view ? `${view.phase.name}:${view.phase.hour ?? ''}` : '';
}

// Spoken and shown text for the current step. Identical for every player, so it can't
// leak anything.
export function lineFor(view) {
  const { name, hour } = view.phase;
  const nameOf = (id) => view.players.find((p) => p.id === id)?.name ?? t('someone');
  switch (name) {
    case 'ROLE_REVEAL': return t('say.reveal');
    case 'NIGHT_INTRO': return t('say.nightIntro');
    case 'HOUR': return t('say.hour', { hour });
    case 'FOLLOWER_CHOICE': return t('say.followerChoice');
    case 'FOLLOWER_MEET': return t('say.followerMeet');
    case 'DAWN': return t('say.dawn');
    case 'DISCUSSION': return t('say.discussion');
    case 'VOTE': return t('say.vote');
    case 'RESULTS': {
      const r = view.results;
      return t(r.thiefCaught ? 'say.caught' : 'say.away', { thief: nameOf(r.thiefId), follower: nameOf(r.followerId) });
    }
    default:
      return '';
  }
}

// 'auto' | 'on' | 'off'
export function narrationPref() {
  return ['on', 'off'].includes(prefs.narration) ? prefs.narration : 'auto';
}

export function narratesHere(view) {
  const pref = narrationPref();
  if (pref !== 'auto') return pref === 'on';
  return view.room.hostId === view.me.id && view.room.settings.narratorOnHost;
}

export function toggleNarration(view) {
  prefs.narration = narratesHere(view) ? 'off' : 'on';
}

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
synth?.getVoices(); // some browsers only start loading voices when first asked

// The nicest voice for this phone's language: English prefers a US/UK voice, Mandarin a
// mainland one (zh-CN), then any voice in the language. Voices built into the phone come
// first: Chrome's online "Google" voices can fail silently or cut out mid-sentence.
function pickVoice(language) {
  const voices = synth?.getVoices() ?? [];
  const base = language.slice(0, 2);
  const exact = language === 'en-US' ? /en[-_](GB|US)/i : new RegExp(language.replace('-', '[-_]'), 'i');
  const nice = (v) => /natural|enhanced|premium|siri/i.test(v.name);
  for (const pool of [voices.filter((v) => v.localService), voices]) {
    const match = pool.find((v) => exact.test(v.lang) && nice(v))
      ?? pool.find((v) => exact.test(v.lang))
      ?? pool.find((v) => v.lang.toLowerCase().startsWith(base));
    if (match) return match;
  }
  return null;
}

export const canSpeak = Boolean(synth);

// iOS 17+: let the narrator be heard even with the ringer switch on silent.
function playEvenOnSilent() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // older browsers: nothing to do
  }
}

// A line the browser refused to speak until the player taps (some phones block speech
// that doesn't follow a tap). It is spoken on the next tap.
let waitingForTap = null;
let lineActive = null; // the step's line while it is being spoken

// Speak `text` aloud. `onResult(true|false)` reports whether the voice actually started.
export function speak(text, onResult) {
  if (!synth || !text) {
    onResult?.(false);
    return;
  }
  playEvenOnSilent();
  const u = new SpeechSynthesisUtterance(text);
  const language = speechLang();
  const voice = pickVoice(language);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? language;
  u.rate = 0.95;
  u.pitch = 1.05;

  let reported = false;
  const report = (ok) => {
    if (reported) return;
    reported = true;
    onResult?.(ok);
  };
  u.onstart = () => {
    lineActive = u;
    report(true);
  };
  u.onend = () => { if (lineActive === u) lineActive = null; };
  u.onerror = (e) => {
    if (lineActive === u) lineActive = null;
    if (e.error === 'not-allowed') {
      waitingForTap = text;
      toast(t('narr.tapToHear'));
    }
    if (e.error !== 'interrupted' && e.error !== 'canceled') report(false);
  };
  setTimeout(() => report(false), 4000);

  synth.cancel();
  synth.resume(); // Chrome and Safari can get stuck "paused"
  // Some browsers drop a line queued in the same moment as cancel(), so wait a beat.
  setTimeout(() => synth.speak(u), 80);
}

// The countdown at the end of each hour: "10, 9, … 1", one number per second, timed
// from the server's clock like the on-screen timer. A number never talks over the hour's
// opening line; the count just joins in once the line has finished.
let countdownTimers = [];

export function stopCountdown() {
  for (const timer of countdownTimers) clearTimeout(timer);
  countdownTimers = [];
}

export function startCountdown(endsAt, from = 10) {
  stopCountdown();
  if (!synth) return;
  for (let n = from; n >= 1; n--) {
    const delay = endsAt - n * 1000 - serverNow();
    if (delay < 0) continue;
    countdownTimers.push(setTimeout(() => {
      if (lineActive) return;
      const u = new SpeechSynthesisUtterance(String(n));
      const language = speechLang();
      const voice = pickVoice(language);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? language;
      u.rate = 1.05;
      synth.cancel(); // a number never queues up behind the last one
      synth.speak(u);
    }, delay));
  }
}

// Called on every tap. iOS only allows speech after a tap, so the first one speaks a
// silent line; a line that was blocked earlier is spoken now.
let unlocked = false;
export function unlockSpeech() {
  if (!synth) return;
  if (!unlocked) {
    unlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }
  if (waitingForTap) {
    const text = waitingForTap;
    waitingForTap = null;
    speak(text);
  }
}

// The "Test the voice" button: speak a sample line and say so if nothing could be heard.
export function testVoice() {
  if (!synth) {
    toast(t('narr.noVoice'), 6000);
    return;
  }
  speak(t('say.test'), (ok) => { if (!ok) toast(t('narr.cantHear'), 7000); });
}
