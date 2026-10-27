// Cheese Thief rules: pure functions, no I/O, no timers, no Math.random.
//
// Source of truth: RULES.md, plus the owner decisions in RULES.md §11 / PLAN.md §2.
// The server owns the clock and sockets. It calls these functions and sends each player
// only viewFor(game, thatPlayer).
//
// Every state-changing function returns { game, notify, error? }:
//   game    the new state (the input is never mutated)
//   notify  ids of the players whose view changed and who should be sent a fresh view
//   error   a short code when the intent was refused; game is then the input unchanged

export const RULE_OPTIONS = Object.freeze({
  minPlayers: 4, // RULES.md header: 4-8 players
  maxPlayers: 8,
  hours: 6, // RULES.md §3: one six-sided die per player
  thiefCanPeek: false, // Owner decision Q3: a lone Thief only steals
  tieCatchesThief: true, // Owner decision Q6: a Thief tied for most votes is caught
  allowSelfVote: false, // Owner decision Q7
});

export const ROLE = Object.freeze({ THIEF: 'thief', SLEEPYHEAD: 'sleepyhead' });

export const PHASE = Object.freeze({
  ROLE_REVEAL: 'ROLE_REVEAL',
  NIGHT_INTRO: 'NIGHT_INTRO',
  HOUR: 'HOUR',
  FOLLOWER_CHOICE: 'FOLLOWER_CHOICE',
  FOLLOWER_MEET: 'FOLLOWER_MEET',
  DAWN: 'DAWN',
  DISCUSSION: 'DISCUSSION',
  VOTE: 'VOTE',
  RESULTS: 'RESULTS',
});

const ORDER = [
  PHASE.ROLE_REVEAL,
  PHASE.NIGHT_INTRO,
  PHASE.HOUR,
  PHASE.FOLLOWER_CHOICE,
  PHASE.FOLLOWER_MEET,
  PHASE.DAWN,
  PHASE.DISCUSSION,
  PHASE.VOTE,
  PHASE.RESULTS,
];

const phaseIndex = (phase) => ORDER.indexOf(phase);
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const ok = (game, notify) => ({ game, notify });
const refuse = (game, error) => ({ game, notify: [], error });

// ---------------------------------------------------------------------------
// Setup

// Deals roles and rolls dice (RULES.md §3). `deal` lets tests fix the thief and dice.
export function createGame(playerIds, rng, deal = {}) {
  const ids = [...playerIds];
  if (ids.length < RULE_OPTIONS.minPlayers || ids.length > RULE_OPTIONS.maxPlayers) {
    throw new Error(`Cheese Thief needs ${RULE_OPTIONS.minPlayers}-${RULE_OPTIONS.maxPlayers} players`);
  }
  if (new Set(ids).size !== ids.length) throw new Error('Player ids must be unique');

  const thiefId = deal.thiefId ?? pick(ids, rng);
  if (!ids.includes(thiefId)) throw new Error('Thief must be one of the players');

  const dice = {};
  for (const id of ids) {
    const die = deal.dice?.[id] ?? 1 + Math.floor(rng() * RULE_OPTIONS.hours);
    if (!Number.isInteger(die) || die < 1 || die > RULE_OPTIONS.hours) throw new Error('Bad die');
    dice[id] = die;
  }

  return {
    playerIds: ids,
    thiefId,
    dice,
    phase: PHASE.ROLE_REVEAL,
    hour: null,
    revealed: [],
    stolenAtHour: null,
    peeks: {}, // peekerId -> { playerId, die }
    followerId: null,
    followerPickedBy: null, // 'thief' | 'random'
    votes: {}, // voterId -> targetId
  };
}

export const roleOf = (game, id) => (id === game.thiefId ? ROLE.THIEF : ROLE.SLEEPYHEAD);
export const sleepyheads = (game) => game.playerIds.filter((id) => id !== game.thiefId);
export const thiefHour = (game) => game.dice[game.thiefId];

// Players whose die shows `hour`: the ones who open their eyes then (RULES.md §4).
export const awakeAt = (game, hour) =>
  game.playerIds.filter((id) => game.dice[id] === hour).sort(byId);

const isAwake = (game, id) => game.phase === PHASE.HOUR && game.dice[id] === game.hour;

// Has this player's hour begun (so they have something to remember)?
function hourHasStarted(game, hour) {
  const i = phaseIndex(game.phase);
  if (i > phaseIndex(PHASE.HOUR)) return true;
  return game.phase === PHASE.HOUR && game.hour >= hour;
}

// RULES.md §4: only a Sleepyhead awake alone may peek, once.
function canPeek(game, id) {
  if (!isAwake(game, id) || game.peeks[id]) return false;
  if (roleOf(game, id) === ROLE.THIEF && !RULE_OPTIONS.thiefCanPeek) return false;
  return awakeAt(game, game.hour).length === 1;
}

const canSteal = (game, id) =>
  id === game.thiefId && isAwake(game, id) && game.stolenAtHour === null;

function steal(game) {
  const next = structuredClone(game);
  next.stolenAtHour = game.hour;
  return ok(next, awakeAt(game, game.hour));
}

// ---------------------------------------------------------------------------
// Intents (things players do)

export function applyIntent(game, playerId, intent) {
  if (!game.playerIds.includes(playerId)) return refuse(game, 'NOT_IN_GAME');
  const target = intent?.playerId;
  const validTarget = typeof target === 'string' && game.playerIds.includes(target);

  switch (intent?.t) {
    case 'revealed': {
      if (game.phase !== PHASE.ROLE_REVEAL) return refuse(game, 'WRONG_PHASE');
      if (game.revealed.includes(playerId)) return refuse(game, 'ALREADY_DONE');
      const next = structuredClone(game);
      next.revealed.push(playerId);
      return ok(next, [...game.playerIds]);
    }

    case 'steal': {
      // RULES.md §4: the Thief steals the cheese on the Thief's own hour.
      if (!canSteal(game, playerId)) return refuse(game, 'NOT_ALLOWED');
      return steal(game);
    }

    case 'peek': {
      if (!canPeek(game, playerId)) return refuse(game, 'NOT_ALLOWED');
      if (!validTarget || target === playerId) return refuse(game, 'BAD_TARGET');
      const next = structuredClone(game);
      next.peeks[playerId] = { playerId: target, die: game.dice[target] };
      return ok(next, [playerId]);
    }

    case 'chooseFollower': {
      // Owner decision Q4: after hour 6 the Thief picks any one Sleepyhead.
      if (game.phase !== PHASE.FOLLOWER_CHOICE) return refuse(game, 'WRONG_PHASE');
      if (playerId !== game.thiefId) return refuse(game, 'NOT_ALLOWED');
      if (game.followerId !== null) return refuse(game, 'ALREADY_DONE');
      if (!validTarget || target === game.thiefId) return refuse(game, 'BAD_TARGET');
      const next = structuredClone(game);
      next.followerId = target;
      next.followerPickedBy = 'thief';
      return ok(next, [playerId]);
    }

    case 'vote': {
      // RULES.md §7: one simultaneous vote each. Owner decision Q7: no self-votes.
      if (game.phase !== PHASE.VOTE) return refuse(game, 'WRONG_PHASE');
      if (game.votes[playerId] !== undefined) return refuse(game, 'ALREADY_DONE');
      if (!validTarget) return refuse(game, 'BAD_TARGET');
      if (target === playerId && !RULE_OPTIONS.allowSelfVote) return refuse(game, 'BAD_TARGET');
      const next = structuredClone(game);
      next.votes[playerId] = target;
      return ok(next, [...game.playerIds]);
    }

    default:
      return refuse(game, 'UNKNOWN_INTENT');
  }
}

// ---------------------------------------------------------------------------
// Clock events (the server calls these when its timers fire)

// PLAN.md D1: if the Thief hasn't tapped "Take the cheese" by the deadline near the end of
// their hour, the steal happens anyway, while the others awake can still see it.
export function stealDeadline(game) {
  if (game.phase !== PHASE.HOUR || !canSteal(game, game.thiefId)) return ok(game, []);
  return steal(game);
}

// Phases that may end before their timer: the server ends them as soon as this is true.
// Night steps never end early (PLAN.md D3: no timing side channel).
export function canEndEarly(game) {
  if (game.phase === PHASE.ROLE_REVEAL) return game.revealed.length === game.playerIds.length;
  if (game.phase === PHASE.VOTE) return Object.keys(game.votes).length === game.playerIds.length;
  return false;
}

// Moves to the next step, finishing anything the current step requires.
export function advance(game, rng) {
  const next = structuredClone(game);
  const everyone = [...game.playerIds];

  switch (game.phase) {
    case PHASE.ROLE_REVEAL:
      next.phase = PHASE.NIGHT_INTRO;
      break;
    case PHASE.NIGHT_INTRO:
      next.phase = PHASE.HOUR;
      next.hour = 1;
      break;
    case PHASE.HOUR:
      // Safety net behind stealDeadline: the steal is mandatory.
      if (game.hour === thiefHour(game) && game.stolenAtHour === null) next.stolenAtHour = game.hour;
      if (game.hour < RULE_OPTIONS.hours) {
        next.hour = game.hour + 1;
      } else {
        next.phase = PHASE.FOLLOWER_CHOICE;
        next.hour = null;
      }
      break;
    case PHASE.FOLLOWER_CHOICE:
      // Owner decision Q4/Q5: there is always exactly one Follower; random on timeout.
      if (next.followerId === null) {
        next.followerId = pick(sleepyheads(game), rng);
        next.followerPickedBy = 'random';
      }
      next.phase = PHASE.FOLLOWER_MEET;
      break;
    case PHASE.FOLLOWER_MEET:
      next.phase = PHASE.DAWN;
      break;
    case PHASE.DAWN:
      next.phase = PHASE.DISCUSSION;
      break;
    case PHASE.DISCUSSION:
      next.phase = PHASE.VOTE;
      break;
    case PHASE.VOTE:
      next.phase = PHASE.RESULTS;
      break;
    default:
      return refuse(game, 'GAME_OVER');
  }
  return ok(next, everyone);
}

// ---------------------------------------------------------------------------
// Voting and winning (RULES.md §7)

export function tallyVotes(game) {
  const counts = Object.fromEntries(game.playerIds.map((id) => [id, 0]));
  for (const target of Object.values(game.votes)) counts[target] += 1;
  const max = Math.max(...Object.values(counts));
  const leaders = max > 0 ? game.playerIds.filter((id) => counts[id] === max).sort(byId) : [];
  return { counts, max, leaders };
}

export function outcome(game) {
  const { counts, max, leaders } = tallyVotes(game);
  // "If the Cheese Thief receives the highest number of votes": with no votes at all
  // nobody received any, so the Thief is not caught (RULES.md §11.5, inferred).
  const thiefLeads = max > 0 && counts[game.thiefId] === max;
  const thiefCaught = thiefLeads && (RULE_OPTIONS.tieCatchesThief || leaders.length === 1);
  const winners = thiefCaught
    ? game.playerIds.filter((id) => id !== game.thiefId && id !== game.followerId)
    : game.playerIds.filter((id) => id === game.thiefId || id === game.followerId);
  return { counts, leaders, thiefCaught, winners: winners.sort(byId) };
}

// ---------------------------------------------------------------------------
// Per-player view: the ONLY game data a client ever receives.
// Built field by field from what this player is entitled to know right now.

export function viewFor(game, me) {
  if (!game.playerIds.includes(me)) throw new Error('Not a player in this game');
  const view = {
    phase: { name: game.phase },
    me: { id: me, role: roleOf(game, me), die: game.dice[me] },
    night: nightView(game, me),
  };
  if (game.phase === PHASE.HOUR) view.phase.hour = game.hour;

  if (game.phase === PHASE.ROLE_REVEAL) {
    view.reveal = { doneIds: [...game.revealed].sort(byId) };
  }

  const follower = followerView(game, me);
  if (follower) view.follower = follower;

  if (game.phase === PHASE.VOTE) {
    view.vote = { votedIds: Object.keys(game.votes).sort(byId) };
    if (game.votes[me] !== undefined) view.vote.myVote = game.votes[me];
  }

  if (game.phase === PHASE.RESULTS) view.results = resultsView(game);
  return view;
}

function nightView(game, me) {
  const myHour = game.dice[me];
  const night = { awakeNow: isAwake(game, me) };
  if (!hourHasStarted(game, myHour)) return night;

  const iAmThief = me === game.thiefId;
  const seen = {
    hour: myHour,
    companions: awakeAt(game, myHour).filter((id) => id !== me),
  };

  // What was on the table while I was awake (owner decision 1).
  const tHour = thiefHour(game);
  if (iAmThief || myHour === tHour) seen.cheeseOnTable = game.stolenAtHour === null;
  else seen.cheeseOnTable = myHour < tHour;

  // Awake at the Thief's hour: you watched the Thief take the cheese (RULES.md §4/§5).
  if (!iAmThief && myHour === tHour && game.stolenAtHour !== null) seen.thiefId = game.thiefId;

  if (game.peeks[me]) seen.peek = { ...game.peeks[me] };

  if (night.awakeNow) {
    if (canSteal(game, me)) seen.canSteal = true;
    if (canPeek(game, me)) seen.canPeek = true;
  }
  night.seen = seen;
  return night;
}

function followerView(game, me) {
  const i = phaseIndex(game.phase);
  if (me === game.thiefId && i >= phaseIndex(PHASE.FOLLOWER_CHOICE)) {
    const view = {};
    if (game.phase === PHASE.FOLLOWER_CHOICE) view.options = sleepyheads(game).sort(byId);
    if (game.followerId !== null) view.chosenId = game.followerId;
    return view;
  }
  // Owner decision Q4: the Follower is told at the meet-up, not before.
  if (me === game.followerId && i >= phaseIndex(PHASE.FOLLOWER_MEET)) {
    return { isYou: true, thiefId: game.thiefId };
  }
  return null;
}

function resultsView(game) {
  const { counts, leaders, thiefCaught, winners } = outcome(game);
  return {
    thiefId: game.thiefId,
    followerId: game.followerId,
    followerPickedBy: game.followerPickedBy,
    roles: Object.fromEntries(game.playerIds.map((id) => [id, roleOf(game, id)])),
    dice: { ...game.dice },
    votes: { ...game.votes },
    counts,
    leaders,
    thiefCaught,
    winners,
  };
}
