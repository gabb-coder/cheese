// Plays whole games through the pure rules with random (but seeded) player behaviour.
// `onStep(game, label)` is called after every state change, so tests can inspect every
// view every player could have received.

import {
  PHASE, createGame, applyIntent, advance, stealDeadline, canEndEarly, awakeAt,
} from '../../game/rules.js';
import { seededRng } from '../../game/rng.js';

export const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

export function simulateGame(n, seed, onStep = () => {}, deal) {
  const rng = seededRng(seed);
  let game = createGame(ids(n), rng, deal);
  onStep(game, 'deal');

  const act = (playerId, intent, label) => {
    const res = applyIntent(game, playerId, intent);
    if (res.error) throw new Error(`${label}: ${res.error}`);
    game = res.game;
    onStep(game, label);
  };
  const next = (label) => {
    game = advance(game, rng).game;
    onStep(game, label);
  };
  const chance = (p) => rng() < p;
  const someoneElse = (me) => {
    const others = game.playerIds.filter((id) => id !== me);
    return others[Math.floor(rng() * others.length)];
  };

  // Role reveal: sometimes everyone confirms, sometimes the timer runs out.
  for (const id of game.playerIds) if (chance(0.8)) act(id, { t: 'revealed' }, `reveal ${id}`);
  next(canEndEarly(game) ? 'all revealed' : 'reveal timeout');
  next('intro over');

  // Hours 1-6.
  while (game.phase === PHASE.HOUR) {
    const awake = awakeAt(game, game.hour);
    for (const id of awake) {
      if (id === game.thiefId && chance(0.7)) act(id, { t: 'steal' }, `steal ${id}`);
      if (awake.length === 1 && id !== game.thiefId && chance(0.8)) {
        act(id, { t: 'peek', playerId: someoneElse(id) }, `peek ${id}`);
      }
    }
    const deadline = stealDeadline(game);
    if (deadline.notify.length) {
      game = deadline.game;
      onStep(game, 'steal deadline');
    }
    next(`end of hour ${game.hour}`);
  }

  // Follower choice: the Thief usually chooses, otherwise the timer picks.
  if (chance(0.75)) act(game.thiefId, { t: 'chooseFollower', playerId: someoneElse(game.thiefId) }, 'choose follower');
  next('follower choice over');
  next('meet-up over');
  next('dawn over');
  next('discussion over');

  for (const id of game.playerIds) if (chance(0.9)) act(id, { t: 'vote', playerId: someoneElse(id) }, `vote ${id}`);
  next('vote over');
  return game;
}
