// The automated moderator: one fixed line per game step (PLAN.md D8).
// Every phone shows the line as a caption. Only narrating phones speak it: by default the
// host's (if the host setting is on), and anyone can switch their own phone on or off.

import { prefs } from './storage.js';

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

export function stepKey(view) {
  return view ? `${view.phase.name}:${view.phase.hour ?? ''}` : '';
}

// Spoken and shown text for the current step. Identical for every player, so it can't
// leak anything.
export function lineFor(view) {
  const { name, hour } = view.phase;
  switch (name) {
    case 'ROLE_REVEAL':
      return 'Welcome to Cheese Thief. Press and hold your card to see your role and your number.';
    case 'NIGHT_INTRO':
      return 'Night falls on the mouse house. Everyone, close your eyes.';
    case 'HOUR':
      return `${hour > 1 ? 'Close your eyes. ' : ''}It's ${WORDS[hour]} o'clock. If you rolled a ${hour}, open your eyes.`;
    case 'FOLLOWER_CHOICE':
      return 'Close your eyes. Cheese Thief, open your eyes and choose your Follower.';
    case 'FOLLOWER_MEET':
      return 'Follower, open your eyes. Thief and Follower, look at your phones and see each other.';
    case 'DAWN':
      return 'Everyone, close your eyes. … Good morning! Everyone, wake up. The cheese is gone!';
    case 'DISCUSSION':
      return 'Time to talk. When did you wake up, and what did you see? Find the Thief!';
    case 'VOTE':
      return 'Time to vote. Who is the Cheese Thief?';
    case 'RESULTS': {
      const r = view.results;
      const nameOf = (id) => view.players.find((p) => p.id === id)?.name ?? 'someone';
      return r.thiefCaught
        ? `The votes are in. ${nameOf(r.thiefId)} was the Cheese Thief, and got caught! The Sleepyheads win!`
        : `The votes are in. The Cheese Thief was ${nameOf(r.thiefId)}, and got away! ${nameOf(r.thiefId)} and the Follower, ${nameOf(r.followerId)}, win!`;
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
let voice = null;

function pickVoice() {
  const voices = synth?.getVoices() ?? [];
  voice = voices.find((v) => /en[-_](GB|US)/i.test(v.lang) && /natural|enhanced|premium|google/i.test(v.name))
    ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
}
synth?.addEventListener?.('voiceschanged', pickVoice);
pickVoice();

export const canSpeak = Boolean(synth);

export function speak(text) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  u.rate = 0.95;
  u.pitch = 1.05;
  synth.speak(u);
}

// iOS only allows speech after a user gesture: speak silence on the first tap.
let unlocked = false;
export function unlockSpeech() {
  if (unlocked || !synth) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}
