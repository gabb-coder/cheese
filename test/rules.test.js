import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RULE_OPTIONS, PHASE, ROLE, createGame, applyIntent, advance, stealDeadline, canEndEarly,
  awakeAt, tallyVotes, outcome, viewFor,
} from '../game/rules.js';
import { seededRng } from '../game/rng.js';
import { assertEntitled } from './helpers/entitlement.js';
import { ids, simulateGame } from './helpers/simulate.js';

const rng = seededRng(1);
const COUNTS = [4, 5, 6, 7, 8];

// Fixed deal: dice listed in player order p1, p2, ...
function deal(diceList, thiefIndex) {
  const players = ids(diceList.length);
  return {
    players,
    deal: {
      thiefId: players[thiefIndex],
      dice: Object.fromEntries(players.map((id, i) => [id, diceList[i]])),
    },
  };
}

function newGame(diceList, thiefIndex) {
  const d = deal(diceList, thiefIndex);
  return createGame(d.players, rng, d.deal);
}

function must({ game, error }) {
  assert.equal(error, undefined, `unexpected refusal: ${error}`);
  return game;
}

const act = (game, id, intent) => must(applyIntent(game, id, intent));
const step = (game) => must(advance(game, rng));

function toPhase(game, phase, hour) {
  while (!(game.phase === phase && (hour === undefined || game.hour === hour))) {
    if (game.phase === PHASE.RESULTS) throw new Error(`never reached ${phase} ${hour ?? ''}`);
    game = step(game);
  }
  return game;
}

// ---------------------------------------------------------------------------

describe('setup (RULES.md §3)', () => {
  it('accepts 4-8 players and rejects other counts', () => {
    for (const n of COUNTS) assert.doesNotThrow(() => createGame(ids(n), rng));
    assert.throws(() => createGame(ids(3), rng));
    assert.throws(() => createGame(ids(9), rng));
    assert.equal(RULE_OPTIONS.minPlayers, 4);
    assert.equal(RULE_OPTIONS.maxPlayers, 8);
  });

  it('rejects duplicate player ids', () => {
    assert.throws(() => createGame(['a', 'a', 'b', 'c'], rng));
  });

  it('deals exactly one Thief and rolls a 1-6 die for every player', () => {
    for (const n of COUNTS) {
      for (let seed = 0; seed < 50; seed++) {
        const game = createGame(ids(n), seededRng(seed));
        assert.ok(game.playerIds.includes(game.thiefId));
        const roles = game.playerIds.map((id) => viewFor(game, id).me.role);
        assert.equal(roles.filter((r) => r === ROLE.THIEF).length, 1);
        assert.equal(roles.filter((r) => r === ROLE.SLEEPYHEAD).length, n - 1);
        for (const id of game.playerIds) {
          assert.ok(Number.isInteger(game.dice[id]) && game.dice[id] >= 1 && game.dice[id] <= 6);
        }
      }
    }
  });

  it('is deterministic for a seed and spreads the Thief and dice fairly', () => {
    assert.deepEqual(createGame(ids(6), seededRng(42)), createGame(ids(6), seededRng(42)));
    const thiefSeats = new Map();
    const faces = new Map();
    for (let seed = 0; seed < 3000; seed++) {
      const game = createGame(ids(5), seededRng(seed));
      thiefSeats.set(game.thiefId, (thiefSeats.get(game.thiefId) ?? 0) + 1);
      for (const d of Object.values(game.dice)) faces.set(d, (faces.get(d) ?? 0) + 1);
    }
    assert.equal(thiefSeats.size, 5);
    for (const count of thiefSeats.values()) assert.ok(count > 480 && count < 720, `thief seat count ${count}`);
    assert.equal(faces.size, 6);
    for (const count of faces.values()) assert.ok(count > 2200 && count < 2800, `die face count ${count}`);
  });

  it('starts in role reveal with the cheese on the table and no Follower', () => {
    const game = createGame(ids(4), rng);
    assert.equal(game.phase, PHASE.ROLE_REVEAL);
    assert.equal(game.stolenAtHour, null);
    assert.equal(game.followerId, null);
  });

  it('never mutates the state it is given', () => {
    const game = newGame([1, 2, 3, 4], 0);
    const frozen = structuredClone(game);
    applyIntent(game, 'p1', { t: 'revealed' });
    advance(game, rng);
    assert.deepEqual(game, frozen);
  });
});

describe('phase order', () => {
  it('runs reveal, intro, hours 1-6, follower choice, meet-up, dawn, discussion, vote, results', () => {
    let game = newGame([1, 2, 3, 4], 0);
    const seen = [];
    while (true) {
      seen.push(game.phase === PHASE.HOUR ? `HOUR ${game.hour}` : game.phase);
      const res = advance(game, rng);
      if (res.error) {
        assert.equal(res.error, 'GAME_OVER');
        break;
      }
      game = res.game;
    }
    assert.deepEqual(seen, [
      'ROLE_REVEAL', 'NIGHT_INTRO', 'HOUR 1', 'HOUR 2', 'HOUR 3', 'HOUR 4', 'HOUR 5', 'HOUR 6',
      'FOLLOWER_CHOICE', 'FOLLOWER_MEET', 'DAWN', 'DISCUSSION', 'VOTE', 'RESULTS',
    ]);
  });

  it('every hour is called even when nobody rolled it', () => {
    let game = newGame([3, 3, 3, 3], 0);
    const hours = [];
    while (game.phase !== PHASE.FOLLOWER_CHOICE) {
      if (game.phase === PHASE.HOUR) hours.push(game.hour);
      game = step(game);
    }
    assert.deepEqual(hours, [1, 2, 3, 4, 5, 6]);
  });

  it('notifies everyone on every phase change', () => {
    const game = newGame([1, 2, 3, 4], 0);
    assert.deepEqual(advance(game, rng).notify, game.playerIds);
  });
});

describe('role reveal', () => {
  it('ends early only once everyone has confirmed', () => {
    let game = newGame([1, 2, 3, 4], 0);
    for (const id of ['p1', 'p2', 'p3']) {
      game = act(game, id, { t: 'revealed' });
      assert.equal(canEndEarly(game), false);
    }
    game = act(game, 'p4', { t: 'revealed' });
    assert.equal(canEndEarly(game), true);
  });

  it('refuses a second confirmation and confirmations in other phases', () => {
    let game = act(newGame([1, 2, 3, 4], 0), 'p1', { t: 'revealed' });
    assert.equal(applyIntent(game, 'p1', { t: 'revealed' }).error, 'ALREADY_DONE');
    game = step(game);
    assert.equal(applyIntent(game, 'p2', { t: 'revealed' }).error, 'WRONG_PHASE');
  });

  it('shows each player only their own role and die', () => {
    const game = newGame([1, 2, 3, 4], 2);
    assert.deepEqual(viewFor(game, 'p3').me, { id: 'p3', role: 'thief', die: 3 });
    assert.deepEqual(viewFor(game, 'p1').me, { id: 'p1', role: 'sleepyhead', die: 1 });
  });
});

describe('night: who is awake (RULES.md §4)', () => {
  it('wakes exactly the players whose die shows the hour, at every player count', () => {
    for (const n of COUNTS) {
      for (let seed = 0; seed < 40; seed++) {
        let game = createGame(ids(n), seededRng(seed));
        game = toPhase(game, PHASE.HOUR, 1);
        while (game.phase === PHASE.HOUR) {
          const awake = game.playerIds.filter((id) => game.dice[id] === game.hour);
          assert.deepEqual(awakeAt(game, game.hour), awake.sort());
          for (const id of game.playerIds) {
            const view = viewFor(game, id);
            assert.equal(view.night.awakeNow, awake.includes(id));
            if (awake.includes(id)) {
              assert.deepEqual(view.night.seen.companions, awake.filter((x) => x !== id));
            }
          }
          game = step(game);
        }
      }
    }
  });

  it('lets every player wake together when all rolled the same number', () => {
    let game = toPhase(newGame([5, 5, 5, 5, 5], 0), PHASE.HOUR, 5);
    for (const id of game.playerIds) {
      const seen = viewFor(game, id).night.seen;
      assert.equal(seen.companions.length, 4);
      assert.equal(seen.canPeek, undefined);
    }
    game = act(game, 'p1', { t: 'steal' });
    for (const id of ['p2', 'p3', 'p4', 'p5']) assert.equal(viewFor(game, id).night.seen.thiefId, 'p1');
  });

  it('shows nothing about the night to a player before their own hour', () => {
    const game = toPhase(newGame([1, 6, 6, 6], 0), PHASE.HOUR, 3);
    assert.deepEqual(viewFor(game, 'p2').night, { awakeNow: false });
  });

  it('keeps what a player saw after their hour, but never wakes them again', () => {
    let game = toPhase(newGame([2, 4, 4, 6], 0), PHASE.HOUR, 2);
    game = act(game, 'p1', { t: 'steal' });
    game = toPhase(game, PHASE.HOUR, 4);
    const seen = viewFor(game, 'p2').night.seen;
    assert.deepEqual(seen, { hour: 4, companions: ['p3'], cheeseOnTable: false });
    game = step(game);
    assert.equal(viewFor(game, 'p2').night.awakeNow, false);
    assert.deepEqual(viewFor(game, 'p2').night.seen, seen);
  });
});

describe('night: the cheese (RULES.md §4, owner decision 1)', () => {
  it('is on the table for hours before the Thief and gone for hours after', () => {
    let game = newGame([1, 3, 3, 5, 6], 2); // Thief p3 at hour 3, with p2
    game = toPhase(game, PHASE.HOUR, 1);
    assert.equal(viewFor(game, 'p1').night.seen.cheeseOnTable, true);
    game = toPhase(game, PHASE.HOUR, 3);
    assert.equal(viewFor(game, 'p2').night.seen.cheeseOnTable, true, 'before the steal');
    assert.equal(viewFor(game, 'p3').night.seen.cheeseOnTable, true);
    game = act(game, 'p3', { t: 'steal' });
    assert.equal(viewFor(game, 'p2').night.seen.cheeseOnTable, false, 'after the steal');
    assert.equal(viewFor(game, 'p3').night.seen.cheeseOnTable, false);
    game = toPhase(game, PHASE.HOUR, 5);
    assert.equal(viewFor(game, 'p4').night.seen.cheeseOnTable, false);
    game = toPhase(game, PHASE.HOUR, 6);
    assert.equal(viewFor(game, 'p5').night.seen.cheeseOnTable, false);
    assert.equal(viewFor(game, 'p1').night.seen.cheeseOnTable, true, 'p1 remembers it there');
  });

  it('players sharing an hour without the Thief see each other and the cheese status', () => {
    // Hour 2: p2 + p3 before the Thief. Hour 5: p4 + p5 after the Thief.
    let game = newGame([4, 2, 2, 5, 5], 0);
    game = toPhase(game, PHASE.HOUR, 2);
    assert.deepEqual(viewFor(game, 'p2').night.seen, { hour: 2, companions: ['p3'], cheeseOnTable: true });
    game = toPhase(game, PHASE.HOUR, 4);
    game = act(game, 'p1', { t: 'steal' });
    game = toPhase(game, PHASE.HOUR, 5);
    assert.deepEqual(viewFor(game, 'p5').night.seen, { hour: 5, companions: ['p4'], cheeseOnTable: false });
  });
});

describe('night: the steal (RULES.md §4)', () => {
  it('only the Thief, only on their own hour, only once', () => {
    let game = newGame([3, 3, 1, 2], 0);
    game = toPhase(game, PHASE.HOUR, 1);
    assert.equal(applyIntent(game, 'p1', { t: 'steal' }).error, 'NOT_ALLOWED', 'not their hour');
    game = toPhase(game, PHASE.HOUR, 3);
    assert.equal(applyIntent(game, 'p2', { t: 'steal' }).error, 'NOT_ALLOWED', 'not the Thief');
    assert.equal(viewFor(game, 'p1').night.seen.canSteal, true);
    game = act(game, 'p1', { t: 'steal' });
    assert.equal(game.stolenAtHour, 3);
    assert.equal(viewFor(game, 'p1').night.seen.canSteal, undefined);
    assert.equal(applyIntent(game, 'p1', { t: 'steal' }).error, 'NOT_ALLOWED', 'twice');
  });

  it('notifies only the players awake at that hour', () => {
    const game = toPhase(newGame([3, 3, 3, 2, 1], 0), PHASE.HOUR, 3);
    assert.deepEqual(applyIntent(game, 'p1', { t: 'steal' }).notify, ['p1', 'p2', 'p3']);
  });

  it('happens automatically at the deadline if the Thief does nothing (PLAN.md D1)', () => {
    let game = toPhase(newGame([2, 2, 4, 5], 0), PHASE.HOUR, 2);
    const res = stealDeadline(game);
    assert.equal(res.game.stolenAtHour, 2);
    assert.deepEqual(res.notify, ['p1', 'p2']);
    assert.equal(viewFor(res.game, 'p2').night.seen.thiefId, 'p1');
    // No-op at other hours or once stolen.
    assert.deepEqual(stealDeadline(res.game).notify, []);
    game = toPhase(game, PHASE.HOUR, 3);
    assert.deepEqual(stealDeadline(game).notify, []);
  });

  it('is forced at the end of the hour as a safety net', () => {
    let game = toPhase(newGame([6, 1, 2, 3], 0), PHASE.HOUR, 6);
    game = step(game);
    assert.equal(game.stolenAtHour, 6);
  });

  it('a Thief awake alone can steal but cannot peek (owner decision Q3)', () => {
    const game = toPhase(newGame([4, 1, 2, 3], 0), PHASE.HOUR, 4);
    const seen = viewFor(game, 'p1').night.seen;
    assert.deepEqual(seen, { hour: 4, companions: [], cheeseOnTable: true, canSteal: true });
    assert.equal(applyIntent(game, 'p1', { t: 'peek', playerId: 'p2' }).error, 'NOT_ALLOWED');
  });

  it('Sleepyheads awake with the Thief see who took the cheese, only after it is taken', () => {
    let game = toPhase(newGame([2, 2, 2, 5], 1), PHASE.HOUR, 2);
    assert.equal(viewFor(game, 'p1').night.seen.thiefId, undefined);
    game = act(game, 'p2', { t: 'steal' });
    assert.equal(viewFor(game, 'p1').night.seen.thiefId, 'p2');
    assert.equal(viewFor(game, 'p3').night.seen.thiefId, 'p2');
    assert.equal(viewFor(game, 'p2').night.seen.thiefId, undefined, 'Thief is not told about themself');
    game = toPhase(game, PHASE.DISCUSSION);
    assert.equal(viewFor(game, 'p1').night.seen.thiefId, 'p2', 'remembered into the day');
  });
});

describe('night: peeking (RULES.md §4, PLAN.md D2)', () => {
  it('a lone Sleepyhead may peek at one other die and sees only the number', () => {
    let game = toPhase(newGame([1, 2, 3, 4], 3), PHASE.HOUR, 1);
    assert.equal(viewFor(game, 'p1').night.seen.canPeek, true);
    const res = applyIntent(game, 'p1', { t: 'peek', playerId: 'p4' });
    assert.deepEqual(res.notify, ['p1']);
    game = must(res);
    assert.deepEqual(viewFor(game, 'p1').night.seen.peek, { playerId: 'p4', die: 4 });
    assert.equal(viewFor(game, 'p1').night.seen.canPeek, undefined);
    assert.equal(applyIntent(game, 'p1', { t: 'peek', playerId: 'p2' }).error, 'NOT_ALLOWED', 'only one peek');
  });

  it('cannot peek at yourself or at a non-player', () => {
    const game = toPhase(newGame([1, 2, 3, 4], 3), PHASE.HOUR, 1);
    assert.equal(applyIntent(game, 'p1', { t: 'peek', playerId: 'p1' }).error, 'BAD_TARGET');
    assert.equal(applyIntent(game, 'p1', { t: 'peek', playerId: 'nobody' }).error, 'BAD_TARGET');
    assert.equal(applyIntent(game, 'p1', { t: 'peek' }).error, 'BAD_TARGET');
  });

  it('two or more awake together cannot peek', () => {
    const game = toPhase(newGame([1, 1, 3, 4], 3), PHASE.HOUR, 1);
    assert.equal(viewFor(game, 'p1').night.seen.canPeek, undefined);
    assert.equal(applyIntent(game, 'p1', { t: 'peek', playerId: 'p3' }).error, 'NOT_ALLOWED');
  });

  it('cannot peek outside your own hour', () => {
    let game = toPhase(newGame([1, 2, 3, 4], 3), PHASE.HOUR, 2);
    assert.equal(applyIntent(game, 'p1', { t: 'peek', playerId: 'p3' }).error, 'NOT_ALLOWED');
    game = toPhase(game, PHASE.DISCUSSION);
    assert.equal(applyIntent(game, 'p2', { t: 'peek', playerId: 'p3' }).error, 'NOT_ALLOWED');
  });
});

describe('Follower (owner decisions Q1, Q4, Q5)', () => {
  it('nobody becomes the Follower during the hours, even one Sleepyhead awake with the Thief', () => {
    let game = toPhase(newGame([3, 3, 1, 2], 0), PHASE.HOUR, 3);
    game = act(game, 'p1', { t: 'steal' });
    game = step(game);
    assert.equal(game.followerId, null);
    assert.equal(viewFor(game, 'p2').follower, undefined);
    assert.equal(viewFor(game, 'p1').follower, undefined);
  });

  it('the Thief picks any Sleepyhead after hour 6, including one who never saw them', () => {
    let game = toPhase(newGame([3, 3, 1, 2, 6], 0), PHASE.FOLLOWER_CHOICE);
    assert.deepEqual(viewFor(game, 'p1').follower, { options: ['p2', 'p3', 'p4', 'p5'] });
    const res = applyIntent(game, 'p1', { t: 'chooseFollower', playerId: 'p5' });
    assert.deepEqual(res.notify, ['p1'], 'only the Thief hears about it during the choice');
    game = must(res);
    assert.equal(game.followerId, 'p5');
    assert.equal(game.followerPickedBy, 'thief');
    assert.deepEqual(viewFor(game, 'p1').follower, { options: ['p2', 'p3', 'p4', 'p5'], chosenId: 'p5' });
  });

  it('only the Thief chooses, once, not themself, and only in the Follower step', () => {
    let game = newGame([1, 2, 3, 4], 0);
    game = toPhase(game, PHASE.HOUR, 6);
    assert.equal(applyIntent(game, 'p1', { t: 'chooseFollower', playerId: 'p2' }).error, 'WRONG_PHASE');
    game = step(game);
    assert.equal(applyIntent(game, 'p2', { t: 'chooseFollower', playerId: 'p3' }).error, 'NOT_ALLOWED');
    assert.equal(applyIntent(game, 'p1', { t: 'chooseFollower', playerId: 'p1' }).error, 'BAD_TARGET');
    assert.equal(applyIntent(game, 'p1', { t: 'chooseFollower', playerId: 'zz' }).error, 'BAD_TARGET');
    game = act(game, 'p1', { t: 'chooseFollower', playerId: 'p2' });
    assert.equal(applyIntent(game, 'p1', { t: 'chooseFollower', playerId: 'p3' }).error, 'ALREADY_DONE');
    game = step(game);
    assert.equal(applyIntent(game, 'p1', { t: 'chooseFollower', playerId: 'p3' }).error, 'WRONG_PHASE');
  });

  it('the Follower is not told during the choice, and is told who the Thief is at the meet-up', () => {
    let game = toPhase(newGame([1, 2, 3, 4], 0), PHASE.FOLLOWER_CHOICE);
    game = act(game, 'p1', { t: 'chooseFollower', playerId: 'p3' });
    assert.equal(viewFor(game, 'p3').follower, undefined);
    game = step(game);
    assert.equal(game.phase, PHASE.FOLLOWER_MEET);
    assert.deepEqual(viewFor(game, 'p3').follower, { isYou: true, thiefId: 'p1' });
    assert.deepEqual(viewFor(game, 'p1').follower, { chosenId: 'p3' });
    for (const other of ['p2', 'p4']) assert.equal(viewFor(game, other).follower, undefined);
    game = toPhase(game, PHASE.VOTE);
    assert.deepEqual(viewFor(game, 'p3').follower, { isYou: true, thiefId: 'p1' }, 'kept into the day');
    assert.equal(viewFor(game, 'p2').follower, undefined);
  });

  it('is picked at random from the Sleepyheads if the Thief runs out of time', () => {
    const picked = new Set();
    for (let seed = 0; seed < 200; seed++) {
      let game = toPhase(newGame([1, 2, 3, 4, 5], 2), PHASE.FOLLOWER_CHOICE);
      game = must(advance(game, seededRng(seed)));
      assert.equal(game.followerPickedBy, 'random');
      assert.notEqual(game.followerId, 'p3');
      picked.add(game.followerId);
    }
    assert.deepEqual([...picked].sort(), ['p1', 'p2', 'p4', 'p5']);
  });

  it('there is exactly one Follower at every player count', () => {
    for (const n of COUNTS) {
      for (let seed = 0; seed < 30; seed++) {
        const game = simulateGame(n, seed);
        assert.ok(game.followerId);
        assert.notEqual(game.followerId, game.thiefId);
        const told = game.playerIds.filter((id) => viewFor(game, id).follower?.isYou);
        assert.deepEqual(told, [game.followerId]);
      }
    }
  });
});

describe('voting (RULES.md §7, owner decision Q7)', () => {
  const atVote = () => toPhase(newGame([1, 2, 3, 4, 5], 0), PHASE.VOTE);

  it('one vote each, not for yourself, only in the vote phase', () => {
    let game = toPhase(newGame([1, 2, 3, 4, 5], 0), PHASE.DISCUSSION);
    assert.equal(applyIntent(game, 'p2', { t: 'vote', playerId: 'p1' }).error, 'WRONG_PHASE');
    game = step(game);
    assert.equal(applyIntent(game, 'p2', { t: 'vote', playerId: 'p2' }).error, 'BAD_TARGET');
    assert.equal(applyIntent(game, 'p2', { t: 'vote', playerId: 'zz' }).error, 'BAD_TARGET');
    game = act(game, 'p2', { t: 'vote', playerId: 'p1' });
    assert.equal(applyIntent(game, 'p2', { t: 'vote', playerId: 'p3' }).error, 'ALREADY_DONE');
  });

  it('the Thief may vote for anyone else, including their Follower', () => {
    let game = toPhase(newGame([1, 2, 3, 4, 5], 0), PHASE.FOLLOWER_CHOICE);
    game = act(game, 'p1', { t: 'chooseFollower', playerId: 'p2' });
    game = toPhase(game, PHASE.VOTE);
    assert.equal(applyIntent(game, 'p1', { t: 'vote', playerId: 'p2' }).error, undefined);
  });

  it('shows who has voted but not what anyone else voted', () => {
    let game = atVote();
    game = act(game, 'p2', { t: 'vote', playerId: 'p1' });
    game = act(game, 'p3', { t: 'vote', playerId: 'p4' });
    assert.deepEqual(viewFor(game, 'p2').vote, { votedIds: ['p2', 'p3'], myVote: 'p1' });
    assert.deepEqual(viewFor(game, 'p4').vote, { votedIds: ['p2', 'p3'] });
  });

  it('ends early only when everyone has voted', () => {
    let game = atVote();
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      game = act(game, id, { t: 'vote', playerId: 'p5' });
      assert.equal(canEndEarly(game), false);
    }
    game = act(game, 'p5', { t: 'vote', playerId: 'p1' });
    assert.equal(canEndEarly(game), true);
  });

  it('missing votes count as abstentions (PLAN.md D5)', () => {
    let game = atVote();
    game = act(game, 'p2', { t: 'vote', playerId: 'p1' });
    game = step(game);
    assert.equal(game.phase, PHASE.RESULTS);
    assert.deepEqual(tallyVotes(game).counts, { p1: 1, p2: 0, p3: 0, p4: 0, p5: 0 });
  });
});

describe('winning (RULES.md §7, owner decision Q6)', () => {
  // 6 players. Thief p1, Follower p2, Sleepyheads p3-p6.
  function result(votes) {
    let game = toPhase(newGame([1, 2, 3, 4, 5, 6], 0), PHASE.FOLLOWER_CHOICE);
    game = act(game, 'p1', { t: 'chooseFollower', playerId: 'p2' });
    game = toPhase(game, PHASE.VOTE);
    for (const [voter, target] of Object.entries(votes)) game = act(game, voter, { t: 'vote', playerId: target });
    game = step(game);
    return outcome(game);
  }
  const SLEEPYHEADS_WIN = ['p3', 'p4', 'p5', 'p6'];
  const THIEF_WINS = ['p1', 'p2'];

  it('Thief with the most votes: the Sleepyheads win, not the Follower', () => {
    const r = result({ p2: 'p3', p3: 'p1', p4: 'p1', p5: 'p1', p6: 'p4' });
    assert.equal(r.thiefCaught, true);
    assert.deepEqual(r.winners, SLEEPYHEADS_WIN);
  });

  it('Follower with the most votes: the Thief and the Follower win', () => {
    const r = result({ p1: 'p3', p3: 'p2', p4: 'p2', p5: 'p2', p6: 'p1' });
    assert.equal(r.thiefCaught, false);
    assert.deepEqual(r.winners, THIEF_WINS);
  });

  it('another Sleepyhead with the most votes: the Thief and the Follower win', () => {
    const r = result({ p1: 'p3', p2: 'p3', p4: 'p3', p5: 'p1' });
    assert.deepEqual(r.leaders, ['p3']);
    assert.deepEqual(r.winners, THIEF_WINS);
  });

  it('Thief tied for the most votes with a Sleepyhead: Thief caught', () => {
    const r = result({ p1: 'p3', p2: 'p3', p4: 'p1', p5: 'p1' });
    assert.deepEqual(r.leaders, ['p1', 'p3']);
    assert.equal(r.thiefCaught, true);
    assert.deepEqual(r.winners, SLEEPYHEADS_WIN);
  });

  it('Thief tied for the most votes with the Follower: Thief caught', () => {
    const r = result({ p1: 'p2', p3: 'p2', p4: 'p1', p5: 'p1' });
    assert.deepEqual(r.leaders, ['p1', 'p2']);
    assert.equal(r.thiefCaught, true);
  });

  it('a tie that does not include the Thief: the Thief and the Follower win', () => {
    const r = result({ p1: 'p3', p2: 'p3', p4: 'p5', p5: 'p4', p6: 'p4', p3: 'p5' });
    assert.deepEqual(r.leaders, ['p3', 'p4', 'p5']);
    assert.deepEqual(r.winners, THIEF_WINS);
  });

  it('nobody votes: the Thief received no votes and is not caught', () => {
    const r = result({});
    assert.deepEqual(r.leaders, []);
    assert.equal(r.thiefCaught, false);
    assert.deepEqual(r.winners, THIEF_WINS);
  });

  it('results reveal every role, die, the Follower, every vote and the winners (PLAN.md D4)', () => {
    let game = toPhase(newGame([1, 2, 3, 4], 0), PHASE.VOTE);
    game = act(game, 'p2', { t: 'vote', playerId: 'p1' });
    game = step(game);
    const view = viewFor(game, 'p3');
    assert.equal(view.results.thiefId, 'p1');
    assert.equal(view.results.followerPickedBy, 'random');
    assert.deepEqual(view.results.dice, { p1: 1, p2: 2, p3: 3, p4: 4 });
    assert.deepEqual(view.results.votes, { p2: 'p1' });
    assert.equal(view.results.roles.p1, 'thief');
    assert.deepEqual(viewFor(game, 'p1').results, view.results, 'everyone sees the same results');
  });
});

describe('hidden information in views', () => {
  it('every view at every step of many full games is exactly what that player may know', () => {
    let checked = 0;
    for (const n of COUNTS) {
      for (let seed = 0; seed < 60; seed++) {
        simulateGame(n, seed * 7919 + n, (game, label) => {
          for (const id of game.playerIds) {
            assertEntitled(game, id, viewFor(game, id), `n=${n} seed=${seed} after "${label}"`);
            checked++;
          }
        });
      }
    }
    assert.ok(checked > 10000, `checked ${checked} views`);
  });

  it('covers the RULES.md §10 edge deals: all same die, Thief alone, Thief with one, Thief with several', () => {
    const deals = [
      [4, 4, 4, 4, 4, 4, 4, 4], // everyone at one hour
      [6, 1, 2, 3], // Thief alone, at the last hour
      [1, 1, 5, 6, 6], // Thief with exactly one Sleepyhead, at hour 1
      [2, 2, 2, 2, 5, 5, 3], // Thief with several
    ];
    for (const diceList of deals) {
      for (let seed = 0; seed < 20; seed++) {
        const d = deal(diceList, 0);
        simulateGame(diceList.length, seed, (game, label) => {
          for (const id of game.playerIds) assertEntitled(game, id, viewFor(game, id), `deal ${diceList} ${label}`);
        }, d.deal);
      }
    }
  });

  it('a sleeping player\'s view never changes because of what awake players do', () => {
    for (const n of COUNTS) {
      for (let seed = 0; seed < 40; seed++) {
        let before = null;
        let lastPhase = null;
        simulateGame(n, seed, (game) => {
          const key = `${game.phase}:${game.hour}`;
          if (game.phase === PHASE.HOUR || game.phase === PHASE.FOLLOWER_CHOICE) {
            const sleepers = game.playerIds.filter((id) => !(game.phase === PHASE.HOUR && game.dice[id] === game.hour) &&
              !(game.phase === PHASE.FOLLOWER_CHOICE && id === game.thiefId));
            const now = Object.fromEntries(sleepers.map((id) => [id, JSON.stringify(viewFor(game, id))]));
            if (before && lastPhase === key) {
              for (const id of sleepers) assert.equal(now[id], before[id], `sleeper ${id} saw a change in ${key}`);
            }
            before = now;
          } else {
            before = null;
          }
          lastPhase = key;
        });
      }
    }
  });

  it('sleepers\' night views do not depend on who else is awake or what they did', () => {
    // Same hour, very different situations: the sleeper (p1, die 6) sees the same thing.
    const situations = [
      [6, 2, 2, 2, 3], // Thief p2 with company at hour 2
      [6, 2, 3, 4, 5], // Thief p2 alone; lone Sleepyheads at 3, 4, 5
      [6, 1, 1, 1, 1], // everyone else at hour 1
    ];
    for (let hour = 1; hour <= 5; hour++) {
      const views = situations.map((diceList) => {
        const d = deal(diceList, 1);
        const game = toPhase(createGame(d.players, rng, d.deal), PHASE.HOUR, hour);
        return JSON.stringify(viewFor(game, 'p1'));
      });
      assert.equal(new Set(views).size, 1, `hour ${hour}`);
    }
  });

  it('nobody but the Thief and the Follower can tell who the Follower is before the results', () => {
    for (const n of COUNTS) {
      for (let seed = 0; seed < 30; seed++) {
        simulateGame(n, seed, (game) => {
          if (game.phase === PHASE.RESULTS || game.followerId === null) return;
          for (const id of game.playerIds) {
            if (id === game.thiefId || id === game.followerId) continue;
            assert.equal(viewFor(game, id).follower, undefined);
            assert.ok(!JSON.stringify(viewFor(game, id)).includes('follower'));
          }
        });
      }
    }
  });
});
