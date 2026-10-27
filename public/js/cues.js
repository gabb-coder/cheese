// Sound, vibration and screen wake lock.
//
// PLAN.md D7: nothing here is ever personal. Chimes play on narrating phones only, at step
// changes everyone hears about anyway; every phone vibrates identically at night step
// changes. No phone ever buzzes or beeps because *its* player woke up: that would be heard.

let audio = null;

export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

// Soft bell made of a couple of decaying sine waves (no audio files).
const CHIMES = {
  night: [[523.25, 0], [392.0, 0.18]],
  hour: [[659.25, 0]],
  dawn: [[523.25, 0], [659.25, 0.15], [783.99, 0.3]],
};

export function chime(kind) {
  if (!audio || audio.state !== 'running') return;
  const t0 = audio.currentTime + 0.02;
  for (const [freq, delay] of CHIMES[kind] ?? CHIMES.hour) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + delay);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 1.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + delay);
    osc.stop(t0 + delay + 1.5);
  }
}

export function buzz() {
  try {
    navigator.vibrate?.(70); // Android; iOS Safari has no Vibration API
  } catch {
    // ignore
  }
}

// Keep the screen on during the game (iOS 16.4+, Android Chrome).
export const wakeLockSupported = 'wakeLock' in navigator;
let wanted = false;
let sentinel = null;

async function acquire() {
  if (!wakeLockSupported || !wanted || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null; // e.g. battery saver; the tip on screen covers it
  }
}

export function wantWakeLock(on) {
  wanted = on;
  if (on) acquire();
  else if (sentinel) sentinel.release().catch(() => {});
}

document.addEventListener('visibilitychange', acquire);
export const retryWakeLock = acquire;
