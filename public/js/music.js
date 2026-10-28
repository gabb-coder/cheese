// Background music: four original music-box tunes, synthesised with Web Audio (no files).
//
// PLAN.md D7 applies: the tune depends only on the game step, never on this player's role
// or whether they are awake, and by default only the narrator phone plays it. The music
// ducks while the narrator is speaking.

// ---------------------------------------------------------------------------
// The tunes. Each event: [beat, instrument, midi note(s), length in beats, volume 0-1].
// Instruments: box (music box), bass, pad (soft chord), pluck, tick (clock).

const bar = (n, beatsPerBar) => n * beatsPerBar;

// Lobby: "Mouse House Waltz", 3/4 in C major.
function waltz() {
  const events = [];
  const chords = [
    [48, [64, 67]], [43, [65, 71]], [45, [64, 69]], [41, [65, 69]],
    [48, [64, 67]], [41, [65, 69]], [43, [62, 71]], [48, [64, 67]],
    [48, [64, 67]], [40, [68, 71]], [45, [64, 69]], [41, [65, 69]],
    [43, [64, 67]], [43, [65, 71]], [48, [64, 67]], [48, [64, 67]],
  ];
  chords.forEach(([root, chord], i) => {
    events.push([bar(i, 3), 'bass', root, 1, 0.5]);
    events.push([bar(i, 3) + 1, 'pluck', chord, 0.5, 0.18]);
    events.push([bar(i, 3) + 2, 'pluck', chord, 0.5, 0.18]);
  });
  const melody = [
    [[76, 1], [79, 1], [76, 1]], [[74, 2], [71, 1]], [[72, 1], [76, 1], [81, 1]], [[79, 2], [77, 1]],
    [[76, 1], [79, 1], [84, 1]], [[81, 1.5], [79, 0.5], [77, 1]], [[76, 1], [74, 1], [71, 1]], [[72, 3]],
    [[67, 1], [72, 1], [76, 1]], [[68, 1], [71, 1], [76, 1]], [[81, 2], [84, 1]], [[81, 1], [79, 1], [77, 1]],
    [[76, 1], [79, 1], [76, 1]], [[74, 1], [77, 1], [71, 1]], [[72, 1], [76, 1], [79, 1]], [[84, 3]],
  ];
  melody.forEach((notes, i) => {
    let beat = bar(i, 3);
    for (const [note, length] of notes) {
      events.push([beat, 'box', note, length, 0.55]);
      beat += length;
    }
  });
  return { bpm: 100, beats: 48, volume: 0.9, events };
}

// Night: "Tiptoe Lullaby", slow and sparse, A minor.
function lullaby() {
  const events = [
    [0, 'pad', [57, 60, 64], 8, 0.5], [8, 'pad', [53, 57, 60], 8, 0.5],
    [16, 'pad', [48, 52, 55], 8, 0.5], [24, 'pad', [52, 56, 59], 8, 0.5],
  ];
  for (const [beat, note, length] of [
    [0, 76, 1.5], [2, 81, 1], [3, 79, 1], [4, 76, 3],
    [8, 72, 1], [9, 74, 1], [10, 76, 2], [12, 69, 3],
    [16, 79, 1.5], [17.5, 76, 0.5], [18, 74, 1], [19, 72, 1], [20, 74, 3],
    [24, 71, 1], [25, 76, 1], [26, 80, 2], [28, 76, 1], [29, 71, 3],
  ]) events.push([beat, 'box', note, length, 0.32]);
  // Tiptoeing footsteps, low and quiet.
  for (let beat = 0; beat < 32; beat += 2) events.push([beat + 1, 'pluck', [beat % 8 < 4 ? 45 : 40], 0.4, 0.12]);
  return { bpm: 66, beats: 32, volume: 0.6, events };
}

// Morning, discussion and results: "Morning Crumbs", bouncy, F major.
function morning() {
  const events = [];
  const chords = [[41, [65, 69, 72]], [36, [64, 67, 72]], [38, [65, 69, 74]], [46, [65, 70, 74]],
    [41, [65, 69, 72]], [36, [64, 67, 72]], [46, [65, 70, 74]], [41, [65, 69, 72]]];
  chords.forEach(([root, chord], i) => {
    const b = bar(i, 4);
    events.push([b, 'bass', root, 0.9, 0.5]);
    if (i !== 6) events.push([b + 2, 'bass', root + 7, 0.9, 0.42]);
    events.push([b + 1, 'pluck', chord, 0.4, 0.16]);
    if (i !== 6) events.push([b + 3, 'pluck', chord, 0.4, 0.16]);
  });
  // Bar 7 changes to C on beat 3.
  events.push([26, 'bass', 36, 0.9, 0.42], [27, 'pluck', [64, 67, 72], 0.4, 0.16]);
  for (const [beat, note, length] of [
    [0, 81, 0.5], [0.5, 84, 0.5], [1, 81, 0.5], [1.5, 77, 0.5], [2, 79, 1], [3, 81, 1],
    [4, 79, 0.5], [4.5, 76, 0.5], [5, 72, 1], [6, 76, 0.5], [6.5, 79, 0.5], [7, 84, 1],
    [8, 86, 1], [9, 84, 0.5], [9.5, 81, 0.5], [10, 77, 1], [11, 81, 1],
    [12, 82, 1.5], [13.5, 81, 0.5], [14, 79, 2],
    [16, 81, 0.5], [16.5, 84, 0.5], [17, 81, 0.5], [17.5, 77, 0.5], [18, 79, 1], [19, 81, 1],
    [20, 79, 0.5], [20.5, 76, 0.5], [21, 72, 1], [22, 74, 0.5], [22.5, 76, 0.5], [23, 79, 1],
    [24, 77, 1], [25, 82, 1], [26, 81, 0.5], [26.5, 79, 0.5], [27, 76, 1],
    [28, 77, 2],
  ]) events.push([beat, 'box', note, length, 0.5]);
  return { bpm: 112, beats: 32, volume: 0.8, events };
}

// Vote: a ticking clock over a tense ostinato, D minor.
function vote() {
  const events = [];
  const roots = [38, 34, 31, 33]; // D, B♭, G, A
  roots.forEach((root, i) => {
    const b = bar(i, 4);
    [0, 0, 7, 12, 0, 0, 7, 12].forEach((step, k) => events.push([b + k / 2, 'pluck', [root + 12 + step], 0.4, 0.2]));
    events.push([b, 'bass', root, 3.5, 0.45]);
  });
  for (let beat = 0; beat < 16; beat++) events.push([beat, 'tick', beat % 2 ? 84 : 91, 0.1, 0.25]);
  for (const [beat, note, length] of [
    [0, 81, 2], [2, 77, 1], [3, 76, 1], [4, 74, 2], [6, 77, 2],
    [8, 79, 1], [9, 82, 1], [10, 81, 2], [12, 73, 2], [14, 76, 2],
  ]) events.push([beat, 'box', note, length, 0.4]);
  return { bpm: 120, beats: 16, volume: 0.7, events };
}

const TRACKS = { lobby: waltz(), night: lullaby(), morning: morning(), vote: vote() };
for (const track of Object.values(TRACKS)) track.events.sort((a, b) => a[0] - b[0]);

// Which tune goes with which step of the game.
export function trackFor(phase) {
  if (['NIGHT_INTRO', 'HOUR', 'FOLLOWER_CHOICE', 'FOLLOWER_CHECK', 'FOLLOWER_MEET'].includes(phase)) return 'night';
  if (['DAWN', 'DISCUSSION', 'RESULTS'].includes(phase)) return 'morning';
  if (phase === 'VOTE') return 'vote';
  return 'lobby'; // LOBBY and ROLE_REVEAL
}

// ---------------------------------------------------------------------------
// Instruments

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

function envelope(ctx, out, t, peak, attack, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(out);
  return g;
}

function tone(ctx, out, type, hz, t, end, detune = 0) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = hz;
  osc.detune.value = detune;
  osc.connect(out);
  osc.start(t);
  osc.stop(end);
}

const INSTRUMENTS = {
  // A music-box tine: a pure tone plus a faint, fast-fading overtone.
  box(ctx, out, note, t, len, vol) {
    const ring = Math.min(2.2, 0.8 + len * 0.6);
    tone(ctx, envelope(ctx, out, t, 0.22 * vol, 0.004, 0, ring), 'sine', freq(note), t, t + ring + 0.05);
    tone(ctx, envelope(ctx, out, t, 0.05 * vol, 0.002, 0, 0.25), 'sine', freq(note) * 4, t, t + 0.3);
  },
  // Played an octave up: phone speakers can't carry real bass notes.
  bass(ctx, out, note, t, len, vol, spb) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.connect(out);
    const d = len * spb;
    tone(ctx, envelope(ctx, filter, t, 0.2 * vol, 0.01, d * 0.4, d * 0.6 + 0.1), 'triangle', freq(note + 12), t, t + d + 0.2);
  },
  pluck(ctx, out, notes, t, len, vol) {
    for (const note of notes) tone(ctx, envelope(ctx, out, t, 0.12 * vol, 0.005, 0, 0.35), 'triangle', freq(note), t, t + 0.4);
  },
  pad(ctx, out, notes, t, len, vol, spb) {
    const d = len * spb;
    for (const note of notes) {
      for (const detune of [-5, 5]) {
        tone(ctx, envelope(ctx, out, t, 0.05 * vol, Math.min(1.5, d / 3), d * 0.4, d * 0.5), 'sine', freq(note), t, t + d + 0.1, detune);
      }
    }
  },
  tick(ctx, out, note, t, len, vol) {
    tone(ctx, envelope(ctx, out, t, 0.06 * vol, 0.001, 0, 0.04), 'square', freq(note), t, t + 0.06);
  },
};

// ---------------------------------------------------------------------------
// Playing a tune: notes are scheduled a little ahead of time so they stay in time even
// when the page is busy.

class Player {
  constructor(ctx, destination, name) {
    this.ctx = ctx;
    this.track = TRACKS[name];
    this.name = name;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.connect(destination);
    this.spb = 60 / this.track.bpm;
    this.loopStart = ctx.currentTime + 0.1;
    this.index = 0;
  }

  fadeTo(level, seconds) {
    const g = this.gain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(Math.max(0.0001, g.value), this.ctx.currentTime);
    g.exponentialRampToValueAtTime(Math.max(0.0001, level), this.ctx.currentTime + seconds);
  }

  // Schedule every note that starts before `until` (seconds on the audio clock).
  schedule(until) {
    const { events, beats, volume } = this.track;
    for (;;) {
      if (this.index >= events.length) {
        this.index = 0;
        this.loopStart += beats * this.spb;
      }
      const [beat, kind, notes, len, vol] = events[this.index];
      const t = this.loopStart + beat * this.spb;
      if (t >= until) return;
      if (t >= this.ctx.currentTime) INSTRUMENTS[kind](this.ctx, this.gain, notes, t, len, vol * volume, this.spb);
      this.index += 1;
    }
  }

  stop(fade = 1.2) {
    this.fadeTo(0.0001, fade);
    setTimeout(() => this.gain.disconnect(), fade * 1000 + 200);
  }
}

// For checking the tunes offline: render `seconds` of a tune into an OfflineAudioContext.
export function renderInto(ctx, name, seconds) {
  const player = new Player(ctx, ctx.destination, name);
  player.gain.gain.value = 1;
  player.schedule(seconds);
}

// ---------------------------------------------------------------------------
// The music on this phone

const LOOKAHEAD = 0.5; // seconds
const LEVEL = 1.8; // overall loudness: under the narrator's voice, but audible on a phone speaker
const DUCKED = 0.3; // share of LEVEL while the narrator speaks

let getContext = () => null;
let wanted = null; // name of the tune this phone should play, or null
let player = null;
let duck = null;
let timer = null;

// `contextFn` returns the page's (unlocked) AudioContext, or null before the first tap.
export function initMusic(contextFn) {
  getContext = contextFn;
}

function step() {
  const ctx = getContext();
  if (!ctx || ctx.state !== 'running' || document.hidden) return;
  if (!duck || duck.context !== ctx) {
    duck = ctx.createGain();
    duck.connect(ctx.destination);
  }
  if (player?.name !== wanted) {
    player?.stop();
    player = null;
    if (wanted) {
      player = new Player(ctx, duck, wanted);
      player.fadeTo(LEVEL, 1.5);
    }
  }
  const speaking = 'speechSynthesis' in window && window.speechSynthesis.speaking;
  duck.gain.setTargetAtTime(speaking ? DUCKED : 1, ctx.currentTime, 0.15);
  player?.schedule(ctx.currentTime + LOOKAHEAD);
}

// The tune playing now (for tests), or null.
export const nowPlaying = () => player?.name ?? null;

// Play the named tune (crossfading from the last one), or stop with null.
export function setMusic(name) {
  wanted = name;
  if (wanted && !timer) timer = setInterval(step, 120);
  step();
  if (!wanted && timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Switching away from the app stops the music; coming back starts it again.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    player?.stop(0.2);
    player = null;
  } else {
    step();
  }
});
