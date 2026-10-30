// Validation of client -> server messages (PLAN.md §5).
// Every message must be a JSON object with a known `t` and only that type's fields.
// Anything else is refused with BAD_MESSAGE before it reaches a room.

export const MAX_MESSAGE_BYTES = 2048;
export const NAME_MAX = 16;
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O
export const CODE_LENGTH = 4;

export const SETTINGS_LIMITS = Object.freeze({
  hourSec: [5, 60],
  followerChoiceSec: [10, 60],
  discussionSec: [30, 900],
  voteSec: [15, 180],
});

// A player's mouse: one of the fur colours and one accessory (drawn by the client).
export const LOOK = Object.freeze({
  furs: 8,
  hats: Object.freeze(['none', 'bow', 'flower', 'party', 'glasses', 'beanie', 'bowtie', 'headphones']),
});
const fur = (v) => (Number.isInteger(v) && v >= 0 && v < LOOK.furs ? v : undefined);
const hat = (v) => (typeof v === 'string' && LOOK.hats.includes(v) ? v : undefined);

const roomCode = (v) => {
  if (typeof v !== 'string') return undefined;
  const code = v.trim().toUpperCase();
  const valid = code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
  return valid ? code : undefined;
};

const id = (v) => (typeof v === 'string' && /^[a-z0-9]{1,32}$/.test(v) ? v : undefined);
const token = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v) ? v : undefined);

// Names: trimmed, inner whitespace collapsed, 1-16 characters, no control characters.
export function cleanName(v) {
  if (typeof v !== 'string') return undefined;
  const name = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  if (length < 1 || length > NAME_MAX) return undefined;
  if (/[\p{Cc}\p{Cf}]/u.test(name)) return undefined;
  return name;
}

// Used for duplicate checks: "Ana", " ana " and "ＡＮＡ" are the same name.
export const nameKey = (name) => name.normalize('NFKC').toLocaleLowerCase('en');

function settings(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const out = {};
  for (const [key, value] of Object.entries(v)) {
    if (key === 'narratorOnHost') {
      if (typeof value !== 'boolean') return undefined;
      out[key] = value;
      continue;
    }
    const limits = SETTINGS_LIMITS[key];
    if (!limits || !Number.isInteger(value) || value < limits[0] || value > limits[1]) return undefined;
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

// What a phone remembers of its room, sent back to rebuild it after a server restart.
// All of it is public: every player in the room could see it.
const count = (max) => (v) => (Number.isInteger(v) && v >= 0 && v <= max ? v : undefined);
function botNames(v) {
  if (!Array.isArray(v) || v.length > 7) return undefined;
  const names = v.map(cleanName);
  return names.includes(undefined) ? undefined : names;
}
function scoreList(v) {
  if (!Array.isArray(v) || v.length > 8) return undefined;
  const out = [];
  for (const s of v) {
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return undefined;
    if (Object.keys(s).some((key) => !['name', 'wins', 'played'].includes(key))) return undefined;
    const name = cleanName(s.name);
    const wins = count(9999)(s.wins);
    const played = count(9999)(s.played);
    if (name === undefined || wins === undefined || played === undefined || wins > played) return undefined;
    out.push({ name, wins, played });
  }
  return out;
}

// type -> { field: [parser, required] }
const SCHEMA = {
  hello: { token: [token, true], room: [roomCode, true] },
  create: { name: [cleanName, true] },
  join: { room: [roomCode, true], name: [cleanName, true] },
  rejoin: {
    room: [roomCode, true],
    name: [cleanName, true],
    host: [cleanName, false],
    settings: [settings, false],
    bots: [botNames, false],
    round: [count(9999), false],
    scores: [scoreList, false],
  },
  settings: { settings: [settings, true] },
  look: { fur: [fur, true], hat: [hat, true] },
  kick: { playerId: [id, true] },
  addBot: {},
  removeBot: { playerId: [id, true] },
  start: {},
  revealed: {},
  steal: {},
  peek: { playerId: [id, true] },
  chooseFollower: { playerId: [id, true] },
  endDiscussion: {},
  vote: { playerId: [id, true] },
  playAgain: {},
  endGame: {},
  leave: {},
  ping: {},
};

export const INTENT_TYPES = Object.freeze(Object.keys(SCHEMA));

// Returns { msg } with cleaned fields, or { error, field? }.
export function parseMessage(raw) {
  const text = typeof raw === 'string' ? raw : raw?.toString?.('utf8');
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_MESSAGE_BYTES) return { error: 'BAD_MESSAGE' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'BAD_MESSAGE' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { error: 'BAD_MESSAGE' };
  const spec = Object.hasOwn(SCHEMA, data.t) ? SCHEMA[data.t] : null;
  if (!spec) return { error: 'BAD_MESSAGE' };

  const msg = { t: data.t };
  for (const key of Object.keys(data)) {
    if (key !== 't' && !Object.hasOwn(spec, key)) return { error: 'BAD_MESSAGE', field: key };
  }
  for (const [key, [parse, required]] of Object.entries(spec)) {
    if (data[key] === undefined) {
      if (required) return { error: key === 'name' ? 'BAD_NAME' : 'BAD_MESSAGE', field: key };
      continue;
    }
    const value = parse(data[key]);
    if (value === undefined) return { error: key === 'name' ? 'BAD_NAME' : 'BAD_MESSAGE', field: key };
    msg[key] = value;
  }
  return { msg };
}

// Human-readable text for each error code; the client shows these.
export const ERROR_TEXT = Object.freeze({
  BAD_MESSAGE: 'Something went wrong. Please refresh.',
  BAD_NAME: `Pick a name of 1-${NAME_MAX} characters.`,
  ROOM_NOT_FOUND: 'Room expired or not found. Create a new one.',
  SEAT_NOT_FOUND: 'Your seat in that room is gone. Join again.',
  ROOM_RESTARTED: 'The server restarted. Getting your room back.',
  SERVER_RESTARTING: 'The server is restarting. Try again in a moment.',
  GAME_IN_PROGRESS: 'That game has already started.',
  NAME_TAKEN: 'Someone in that room already has that name.',
  ROOM_FULL: 'That room is full (8 players).',
  NOT_ENOUGH_PLAYERS: 'You need at least 4 players.',
  NOT_ALLOWED: "You can't do that right now.",
  NOT_HOST: 'Only the host can do that.',
  NOT_SEATED: 'Join a room first.',
  ALREADY_SEATED: 'You are already in a room.',
  BOTS_DISABLED: 'Bots are turned off on this server.',
  KICKED: 'The host removed you from the room.',
  REPLACED: 'You opened this seat on another tab or device.',
  RATE_LIMITED: 'Slow down a little!',
  WRONG_PHASE: "You can't do that right now.",
  ALREADY_DONE: 'Already done.',
  BAD_TARGET: "You can't pick that player.",
  NOT_IN_GAME: "You're not in this game.",
  UNKNOWN_INTENT: 'Something went wrong. Please refresh.',
});
