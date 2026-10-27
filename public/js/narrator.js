// The automated moderator: one fixed line per game step (PLAN.md D8).
// Every phone shows the line as a caption. Only narrating phones speak it: by default the
// host's (if the host setting is on), and anyone can switch their own phone on or off.

import { prefs } from './storage.js';
import { t, speechLang } from './i18n.js';

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
// mainland one (zh-CN), then any voice in the language.
function pickVoice(language) {
  const voices = synth?.getVoices() ?? [];
  const base = language.slice(0, 2);
  const exact = language === 'en-US' ? /en[-_](GB|US)/i : new RegExp(language.replace('-', '[-_]'), 'i');
  return voices.find((v) => exact.test(v.lang) && /natural|enhanced|premium|google/i.test(v.name))
    ?? voices.find((v) => exact.test(v.lang))
    ?? voices.find((v) => v.lang.toLowerCase().startsWith(base)) ?? null;
}

export const canSpeak = Boolean(synth);

export function speak(text) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const language = speechLang();
  const voice = pickVoice(language);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? language;
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
