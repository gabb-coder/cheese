// Hidden-information tests over real WebSockets (PLAN.md §6).
//
// Plays many complete games, 4-8 players, where every player is a separate socket client
// acting only on its own view. Every message every client receives is then checked:
// strict schema, never another seat's token, and every piece of game data against what
// that player may know at that moment (independent entitlement checker). Also checks
// that sleeping players' message streams reveal nothing during the night.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../server/index.js';
import { botIntent } from '../server/bots.js';
import { PHASE } from '../game/rules.js';
import { seededRng } from '../game/rng.js';
import { TestClient } from './helpers/client.js';
import { createAuditor } from './helpers/auditor.js';

const TIME_SCALE = 0.004; // a 15 s hour lasts 60 ms
const NIGHT = new Set([PHASE.NIGHT_INTRO, PHASE.HOUR, PHASE.FOLLOWER_CHOICE, PHASE.FOLLOWER_MEET]);

let srv;
let auditor;
const everyone = [];

before(async () => {
  auditor = createAuditor();
  srv = await createServer({
    host: '127.0.0.1', timeScale: TIME_SCALE, botDelayMs: 5, audit: auditor.audit, rng: seededRng(99),
  });
});
after(async () => {
  await Promise.all(everyone.map((c) => c.close()));
  await srv.close();
});

// A client that plays by itself, sometimes hesitating or doing nothing, from its own view.
// The host sometimes ends the discussion early.
function autoplay(client, rng, isHost) {
  let lastStep = '';
  client.ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.t !== 'view' || msg.phase.name === 'LOBBY') return;
    const step = `${msg.phase.name}${msg.phase.hour ?? ''}`;
    const newStep = step !== lastStep;
    lastStep = step;
    if (isHost && newStep && msg.phase.name === PHASE.DISCUSSION && rng() < 0.5) {
      setTimeout(() => client.send({ t: 'endDiscussion' }), Math.floor(rng() * 40));
    }
    const intent = botIntent(msg, rng);
    if (!intent || rng() < 0.25) return;
    setTimeout(() => client.send(intent), Math.floor(rng() * 30));
  });
}

async function playGame(n, seed) {
  const rng = seededRng(seed);
  const clients = [];
  for (let i = 0; i < n; i++) {
    const c = await TestClient.connect(srv.port, `n${n}s${seed}p${i + 1}`);
    clients.push(c);
    everyone.push(c);
  }
  const [host, ...rest] = clients;
  host.send({ t: 'create', name: 'P1' });
  const { room } = await host.waitFor('welcome');
  host.send({ t: 'settings', settings: { discussionSec: 30, voteSec: 15 } });
  for (const [i, c] of rest.entries()) {
    c.send({ t: 'join', room, name: `P${i + 2}` });
    await c.waitFor('welcome');
  }
  clients.forEach((c, i) => autoplay(c, rng, i === 0));
  await host.waitForView((v) => v.players.length === n);

  // Two rounds in the same room, with "play again" in between.
  const rounds = [];
  for (let round = 0; round < 2; round++) {
    host.send({ t: 'start' });
    await Promise.all(clients.map((c) => c.waitForView((v) => v.phase.name === PHASE.RESULTS, 10_000)));
    rounds.push(srv.rooms.get(room).game);
    if (round === 0) {
      host.send({ t: 'playAgain' });
      await Promise.all(clients.map((c) => c.waitForView((v) => v.phase.name === 'LOBBY')));
    }
  }
  return { clients, rounds, game: rounds[1] };
}

describe('hidden information over the wire', () => {
  const games = [];

  before(async () => {
    const runs = [];
    for (const n of [4, 5, 6, 7, 8]) {
      for (let seed = 1; seed <= 6; seed++) runs.push(playGame(n, seed * 31 + n));
    }
    games.push(...(await Promise.all(runs)));
  });

  it('every message to every player in 30 rooms x 2 rounds is allowed', () => {
    let checked = 0;
    for (const { clients } of games) checked += auditor.verify(clients);
    assert.ok(checked > 3000, `checked ${checked} messages`);
  });

  it('the games really happened: every one has a steal, one Follower and a result', () => {
    for (const { rounds } of games) {
      for (const game of rounds) {
        assert.equal(game.phase, PHASE.RESULTS);
        assert.notEqual(game.stolenAtHour, null);
        assert.ok(game.followerId && game.followerId !== game.thiefId);
      }
      assert.notEqual(rounds[0], rounds[1], 'the second round is a new deal');
    }
  });

  // Each client's views, split into rounds (a lobby view separates them).
  function viewsByRound(c) {
    const out = [[]];
    for (const m of c.messages) {
      if (m.t !== 'view') continue;
      if (m.phase.name === 'LOBBY') {
        if (out[out.length - 1].length) out.push([]);
        continue;
      }
      out[out.length - 1].push(m);
    }
    return out.filter((r) => r.length);
  }

  it('during the night a sleeping player receives only step changes', () => {
    for (const { clients, rounds } of games) {
      for (const c of clients) {
        const me = c.id;
        for (const [r, views] of viewsByRound(c).entries()) {
          const game = rounds[r];
          for (let i = 1; i < views.length; i++) {
            const prev = views[i - 1].phase;
            const cur = views[i].phase;
            if (!NIGHT.has(cur.name)) continue;
            const sameStep = prev.name === cur.name && prev.hour === cur.hour;
            if (!sameStep) continue;
            // A second view within one night step: only allowed if this player is active then.
            const awakeHour = cur.name === PHASE.HOUR && game.dice[me] === cur.hour;
            const thiefChoosing = cur.name === PHASE.FOLLOWER_CHOICE && me === game.thiefId;
            assert.ok(awakeHour || thiefChoosing,
              `${c.label} got an extra view in ${cur.name} ${cur.hour ?? ''} while asleep`);
          }
        }
      }
    }
  });

  it('nobody but the Thief and the Follower hears who the Follower is before the results', () => {
    for (const { clients, rounds } of games) {
      for (const c of clients) {
        for (const [r, views] of viewsByRound(c).entries()) {
          const game = rounds[r];
          if (c.id === game.thiefId || c.id === game.followerId) continue;
          for (const m of views) {
            if (m.phase.name === PHASE.RESULTS) continue;
            assert.equal(m.follower, undefined, c.label);
          }
        }
      }
    }
  });
});
