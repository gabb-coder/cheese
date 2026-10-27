// Room + game clock, driven by a fake clock and fake connections (no sockets, no waiting).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Room } from '../server/room.js';
import { PHASE } from '../game/rules.js';
import { seededRng } from '../game/rng.js';
import { assertWireMessage } from './helpers/wire.js';

function fakeClock() {
  let t = 1_000_000;
  let seq = 0;
  const timers = new Map();
  return {
    timers,
    now: () => t,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    // Runs every timer due within `ms`, in order, moving time forward as it goes.
    tick(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, timer] of timers) if (timer.at <= end && (!next || timer.at < next[1].at)) next = [id, timer];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
  };
}

function fakeConn(label) {
  return {
    label,
    room: null,
    seatId: null,
    sent: [],
    send(msg) {
      this.sent.push(structuredClone(msg));
    },
    get last() {
      return this.sent[this.sent.length - 1];
    },
    take() {
      const out = this.sent;
      this.sent = [];
      return out;
    },
  };
}

// A room with `humans` fake players (and optional bots), checking every message sent
// to every seat against the wire schema and the entitlement checker.
function setup({ humans = 4, bots = 0, seed = 1, settings } = {}) {
  const clock = fakeClock();
  const audits = [];
  const room = new Room('ABCD', {
    now: clock.now,
    timers: clock,
    rng: seededRng(seed),
    botDelayMs: 300,
    audit: (seatId, msg, game) => audits.push({ seatId, msg, game }),
  });
  const conns = [];
  for (let i = 0; i < humans; i++) {
    const conn = fakeConn(`p${i + 1}`);
    assert.equal(room.join(conn, `Player ${i + 1}`), null);
    conns.push(conn);
  }
  const host = conns[0];
  for (let i = 0; i < bots; i++) room.handle(host, { t: 'addBot' });
  if (settings) room.handle(host, { t: 'settings', settings });
  const tokens = conns.map((c) => c.sent.find((m) => m.t === 'welcome').token);
  const verify = () => {
    for (const { seatId, msg, game } of audits) {
      const conn = conns.find((c) => c.seatId === seatId);
      assertWireMessage(msg, { seatId, token: conn ? tokens[conns.indexOf(conn)] : null, game, allTokens: tokens });
    }
  };
  const byId = (id) => conns.find((c) => c.seatId === id);
  return { clock, room, conns, host, verify, byId, audits };
}

const start = (env) => {
  env.room.handle(env.host, { t: 'start' });
  return env.room.game;
};
const phaseKey = (room) => `${room.phase}${room.game?.hour ?? ''}`;

describe('game clock', () => {
  it('runs every step for its set time, in order', () => {
    const env = setup();
    const { clock, room } = env;
    start(env);
    const t0 = clock.now();
    assert.equal(env.host.last.phase.endsAt, t0 + 45_000);

    const steps = [];
    let guard = 0;
    while (room.phase !== PHASE.RESULTS && guard++ < 50) {
      const view = env.host.last;
      const ms = view.phase.endsAt - clock.now();
      steps.push([phaseKey(room), ms]);
      clock.tick(ms);
    }
    assert.deepEqual(steps, [
      ['ROLE_REVEAL', 45_000],
      ['NIGHT_INTRO', 8_000],
      ['HOUR1', 15_000], ['HOUR2', 15_000], ['HOUR3', 15_000],
      ['HOUR4', 15_000], ['HOUR5', 15_000], ['HOUR6', 15_000],
      ['FOLLOWER_CHOICE', 20_000],
      ['FOLLOWER_MEET', 8_000],
      ['DAWN', 6_000],
      ['DISCUSSION', 180_000],
      ['VOTE', 45_000],
    ]);
    assert.equal(env.host.last.phase.endsAt, undefined, 'results have no timer');
    assert.equal(clock.timers.size, 0, 'no timers left running');
    env.verify();
  });

  it('uses the host\'s timer settings', () => {
    const env = setup({ settings: { hourSec: 5, followerChoiceSec: 10, discussionSec: 30, voteSec: 15 } });
    start(env);
    for (const c of env.conns) env.room.handle(c, { t: 'revealed' });
    env.clock.tick(8_000);
    assert.equal(env.room.phase, PHASE.HOUR);
    assert.equal(env.host.last.phase.endsAt - env.clock.now(), 5_000);
  });

  it('role reveal ends as soon as everyone has confirmed', () => {
    const env = setup();
    start(env);
    for (const c of env.conns.slice(0, 3)) env.room.handle(c, { t: 'revealed' });
    assert.equal(env.room.phase, PHASE.ROLE_REVEAL);
    env.room.handle(env.conns[3], { t: 'revealed' });
    assert.equal(env.room.phase, PHASE.NIGHT_INTRO);
    assert.equal(env.host.last.phase.name, PHASE.NIGHT_INTRO);
  });

  it('an hour never ends early, even after the Thief has stolen', () => {
    for (let seed = 0; seed < 10; seed++) {
      const env = setup({ seed });
      const game = start(env);
      const thief = env.byId(game.thiefId);
      env.clock.tick(45_000 + 8_000);
      while (env.room.game.hour !== game.dice[game.thiefId]) env.clock.tick(15_000);
      env.room.handle(thief, { t: 'steal' });
      assert.notEqual(env.room.game.stolenAtHour, null);
      env.clock.tick(14_999);
      assert.equal(env.room.game.hour, game.dice[game.thiefId], 'still the same hour');
      env.clock.tick(1);
      assert.notEqual(env.room.game.hour, game.dice[game.thiefId]);
      env.verify();
    }
  });

  it('forces the steal 5 s before the end of the Thief\'s hour and only the awake hear of it', () => {
    for (let seed = 0; seed < 10; seed++) {
      const env = setup({ seed, humans: 6 });
      const game = start(env);
      const tHour = game.dice[game.thiefId];
      env.clock.tick(45_000 + 8_000 + (tHour - 1) * 15_000);
      assert.equal(env.room.game.hour, tHour);
      for (const c of env.conns) c.take();
      env.clock.tick(9_999);
      assert.equal(env.room.game.stolenAtHour, null);
      env.clock.tick(1);
      assert.equal(env.room.game.stolenAtHour, tHour);
      for (const c of env.conns) {
        const awake = game.dice[c.seatId] === tHour;
        assert.equal(c.sent.length, awake ? 1 : 0, `${c.label} awake=${awake}`);
        if (awake && c.seatId !== game.thiefId) assert.equal(c.last.night.seen.thiefId, game.thiefId);
      }
      env.verify();
    }
  });

  it('the vote ends as soon as everyone has voted', () => {
    const env = setup();
    start(env);
    env.clock.tick(45_000 + 8_000 + 6 * 15_000 + 20_000 + 8_000 + 6_000 + 180_000);
    assert.equal(env.room.phase, PHASE.VOTE);
    const ids = env.conns.map((c) => c.seatId);
    env.conns.forEach((c, i) => env.room.handle(c, { t: 'vote', playerId: ids[(i + 1) % ids.length] }));
    assert.equal(env.room.phase, PHASE.RESULTS);
    assert.equal(env.host.last.results.winners.length > 0, true);
    env.verify();
  });

  it('closing the room stops the clock', () => {
    const env = setup();
    start(env);
    env.room.close('expired');
    assert.equal(env.clock.timers.size, 0);
  });
});

describe('night: what goes over the wire', () => {
  // Plays a full game with random human behaviour and returns every seat's messages per step.
  function playNight(seed, humans) {
    const env = setup({ seed, humans });
    const rng = seededRng(seed + 1000);
    const game = start(env);
    for (const c of env.conns) env.room.handle(c, { t: 'revealed' });
    env.clock.tick(8_000);
    const perHour = [];
    for (let hour = 1; hour <= 6; hour++) {
      assert.equal(env.room.game.hour, hour);
      for (const c of env.conns) c.take(); // the hour-start view
      const awake = env.conns.filter((c) => game.dice[c.seatId] === hour);
      const actAt = Math.floor(rng() * 14_000);
      env.clock.tick(actAt);
      for (const c of awake) {
        const seen = env.room.viewMessage(c.seatId).night.seen;
        if (seen.canSteal && rng() < 0.6) env.room.handle(c, { t: 'steal' });
        if (seen.canPeek && rng() < 0.8) {
          const other = env.conns.find((o) => o !== c);
          env.room.handle(c, { t: 'peek', playerId: other.seatId });
        }
      }
      env.clock.tick(15_000 - actAt - 1);
      perHour.push(env.conns.map((c) => ({ c, awake: awake.includes(c), during: c.take() })));
      env.clock.tick(1);
    }
    return { env, game, perHour };
  }

  it('sleepers get nothing during an hour; only the hour-change views', () => {
    for (const humans of [4, 5, 6, 7, 8]) {
      for (let seed = 0; seed < 15; seed++) {
        const { env, perHour } = playNight(seed, humans);
        for (const [h, rows] of perHour.entries()) {
          for (const { c, awake, during } of rows) {
            if (!awake) assert.deepEqual(during, [], `n=${humans} seed=${seed} hour ${h + 1}: sleeper ${c.label} got messages`);
          }
        }
        env.verify();
      }
    }
  });

  it('at each hour change every sleeper gets the same view apart from their own details', () => {
    for (let seed = 0; seed < 15; seed++) {
      const env = setup({ seed, humans: 6 });
      const game = start(env);
      for (const c of env.conns) env.room.handle(c, { t: 'revealed' });
      env.clock.tick(8_000);
      for (let hour = 1; hour <= 6; hour++) {
        const sleepers = env.conns.filter((c) => game.dice[c.seatId] !== hour);
        const shapes = sleepers.map((c) => {
          const { me, night, ...rest } = c.last;
          return JSON.stringify({ ...rest, awakeNow: night.awakeNow });
        });
        assert.equal(new Set(shapes).size <= 1, true, `hour ${hour}`);
        env.clock.tick(15_000);
      }
    }
  });

  it('the Follower choice and meet-up reach only the Thief and the Follower', () => {
    for (let seed = 0; seed < 15; seed++) {
      const { env, game } = playNight(seed, 6);
      assert.equal(env.room.phase, PHASE.FOLLOWER_CHOICE);
      for (const c of env.conns) c.take();
      const thief = env.byId(game.thiefId);
      const pick = env.conns.find((c) => c.seatId !== game.thiefId);
      env.clock.tick(3_000);
      env.room.handle(thief, { t: 'chooseFollower', playerId: pick.seatId });
      for (const c of env.conns) assert.equal(c.take().length, c === thief ? 1 : 0, c.label);
      env.clock.tick(17_000);
      assert.equal(env.room.phase, PHASE.FOLLOWER_MEET);
      assert.deepEqual(pick.last.follower, { isYou: true, thiefId: game.thiefId });
      for (const c of env.conns) if (c !== pick && c !== thief) assert.equal(c.last.follower, undefined);
      env.verify();
    }
  });

  it('a reconnect during the night is not announced until the next step', () => {
    const env = setup({ humans: 5 });
    const game = start(env);
    for (const c of env.conns) env.room.handle(c, { t: 'revealed' });
    env.clock.tick(8_000 + 2_000); // into hour 1
    const mover = env.conns[1];
    const token = mover.sent.find((m) => m.t === 'welcome').token;
    for (const c of env.conns) c.take();
    env.room.detach(mover);
    const back = fakeConn('p2 again');
    env.room.reclaim(back, token);
    assert.ok(back.sent.some((m) => m.t === 'view'), 'the returning player gets their own view');
    for (const c of env.conns) if (c !== mover) assert.deepEqual(c.take(), [], `${c.label} was told`);
    env.clock.tick(13_000);
    for (const c of env.conns) {
      if (c === mover) continue;
      assert.equal(c.last.players.find((p) => p.id === back.seatId).connected, true);
    }
    assert.ok(game);
  });

  it('bots play through the whole night and day with no humans acting', () => {
    for (let seed = 0; seed < 10; seed++) {
      const env = setup({ seed, humans: 1, bots: 4 });
      start(env);
      let guard = 0;
      while (env.room.phase !== PHASE.RESULTS && guard++ < 1000) env.clock.tick(1_000);
      assert.equal(env.room.phase, PHASE.RESULTS);
      const game = env.room.game;
      assert.notEqual(game.stolenAtHour, null);
      if (env.room.seats.get(game.thiefId).isBot) assert.equal(game.followerPickedBy, 'thief');
      env.verify();
    }
  });
});
