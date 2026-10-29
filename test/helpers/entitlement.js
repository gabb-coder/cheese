// Independent check of what one player may know at this moment.
//
// This deliberately does NOT reuse viewFor's logic. It re-derives each player's
// entitlements from RULES.md and the owner decisions, and fails on any field it doesn't
// expect, so a field added to a view by accident fails the tests.
//
// `view` is the game part of a message (the server adds room/player/timer fields on top;
// the socket-level leak tests strip those before calling this).

import assert from 'node:assert/strict';
import { PHASE } from '../../game/rules.js';

const ORDER = [
  PHASE.ROLE_REVEAL, PHASE.NIGHT_INTRO, PHASE.HOUR, PHASE.FOLLOWER_CHOICE,
  PHASE.FOLLOWER_CHECK, PHASE.FOLLOWER_MEET, PHASE.DAWN, PHASE.DISCUSSION, PHASE.VOTE, PHASE.RESULTS,
];
const at = (phase) => ORDER.indexOf(phase);

function onlyKeys(obj, allowed, where) {
  assert.equal(typeof obj, 'object', `${where} must be an object`);
  assert.notEqual(obj, null, `${where} must not be null`);
  for (const key of Object.keys(obj)) {
    assert.ok(allowed.includes(key), `${where} has unexpected key "${key}"`);
  }
}

export function assertEntitled(game, me, view, ctx = '') {
  const where = (path) => `[${ctx} player=${me} phase=${game.phase} hour=${game.hour}] ${path}`;
  const idx = at(game.phase);
  const iAmThief = me === game.thiefId;
  const iAmFollower = me === game.followerId;
  const myHour = game.dice[me];
  const thiefHour = game.dice[game.thiefId];

  // Which sections may exist at all.
  const allowed = ['phase', 'me', 'night'];
  if (game.phase === PHASE.ROLE_REVEAL) allowed.push('reveal');
  if (game.phase === PHASE.VOTE) allowed.push('vote');
  if (game.phase === PHASE.RESULTS) allowed.push('results');
  // The Thief from their own choice; everyone else from the Follower check, when each phone
  // says whether its player is the Follower.
  const followerEntitled =
    (iAmThief && idx >= at(PHASE.FOLLOWER_CHOICE)) ||
    (!iAmThief && idx >= at(PHASE.FOLLOWER_CHECK));
  if (followerEntitled) allowed.push('follower');
  onlyKeys(view, allowed, where('view'));

  // phase: public.
  onlyKeys(view.phase, ['name', 'hour'], where('phase'));
  assert.equal(view.phase.name, game.phase, where('phase.name'));
  if (game.phase === PHASE.HOUR) assert.equal(view.phase.hour, game.hour, where('phase.hour'));
  else assert.equal(view.phase.hour, undefined, where('phase.hour'));

  // me: own role and die only.
  assert.deepEqual(
    view.me,
    { id: me, role: iAmThief ? 'thief' : 'sleepyhead', die: myHour },
    where('me'),
  );

  // night: only my own hour, only once it has started.
  onlyKeys(view.night, ['awakeNow', 'seen'], where('night'));
  const awakeNow = game.phase === PHASE.HOUR && game.hour === myHour;
  assert.equal(view.night.awakeNow, awakeNow, where('night.awakeNow'));
  const started = idx > at(PHASE.HOUR) || (game.phase === PHASE.HOUR && game.hour >= myHour);
  if (!started) {
    assert.equal(view.night.seen, undefined, where('night.seen before my hour'));
  } else {
    const seen = view.night.seen;
    onlyKeys(seen, ['hour', 'companions', 'cheeseOnTable', 'thiefId', 'peek', 'canSteal', 'canPeek'],
      where('night.seen'));
    assert.equal(seen.hour, myHour, where('seen.hour'));
    const companions = game.playerIds.filter((id) => id !== me && game.dice[id] === myHour).sort();
    assert.deepEqual(seen.companions, companions, where('seen.companions'));
    assert.equal(typeof seen.cheeseOnTable, 'boolean', where('seen.cheeseOnTable'));
    if ('thiefId' in seen) {
      assert.ok(!iAmThief, where('thief told own identity via seen.thiefId'));
      assert.equal(myHour, thiefHour, where('seen.thiefId but not awake at the Thief\'s hour'));
      assert.notEqual(game.stolenAtHour, null, where('seen.thiefId before the steal'));
      assert.equal(seen.thiefId, game.thiefId, where('seen.thiefId'));
    }
    if ('peek' in seen) {
      assert.deepEqual(seen.peek, game.peeks[me], where('seen.peek'));
      onlyKeys(seen.peek, ['playerId', 'die'], where('seen.peek'));
      assert.equal(seen.peek.die, game.dice[seen.peek.playerId], where('seen.peek.die'));
    }
    for (const flag of ['canSteal', 'canPeek']) {
      if (flag in seen) {
        assert.ok(awakeNow, where(`${flag} while asleep`));
        assert.equal(seen[flag], true, where(flag));
      }
    }
  }

  if (view.reveal) {
    onlyKeys(view.reveal, ['doneIds'], where('reveal'));
    assert.deepEqual(view.reveal.doneIds, [...game.revealed].sort(), where('reveal.doneIds'));
  }

  // follower: the Thief sees their own choice; from the check on, the Follower learns they
  // are the Follower and who the Thief is, and everyone else only that they are not.
  if (view.follower) {
    if (iAmThief) {
      onlyKeys(view.follower, ['options', 'chosenId'], where('follower'));
      if ('chosenId' in view.follower) assert.equal(view.follower.chosenId, game.followerId, where('chosenId'));
      if ('options' in view.follower) {
        assert.deepEqual(view.follower.options, game.playerIds.filter((id) => id !== me).sort(),
          where('follower.options'));
      }
    } else {
      const expected = iAmFollower ? { isYou: true, thiefId: game.thiefId } : { isYou: false };
      assert.deepEqual(view.follower, expected, where('follower'));
    }
  }

  // vote: who has voted is public, what they voted is not.
  if (view.vote) {
    onlyKeys(view.vote, ['votedIds', 'myVote'], where('vote'));
    assert.deepEqual(view.vote.votedIds, Object.keys(game.votes).sort(), where('vote.votedIds'));
    assert.equal(view.vote.myVote, game.votes[me], where('vote.myVote'));
  }

  if (view.results) {
    onlyKeys(view.results, ['thiefId', 'followerId', 'followerPickedBy', 'roles', 'dice', 'peeks', 'votes',
      'counts', 'leaders', 'thiefCaught', 'winners'], where('results'));
    assert.deepEqual(view.results.peeks, game.peeks, where('results.peeks'));
  }
}
