import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../server/index.js';
import { TestClient } from './helpers/client.js';
import { createAuditor } from './helpers/auditor.js';

let srv;
let clients;
let auditor;

async function start(options = {}) {
  auditor = createAuditor();
  clients = [];
  srv = await createServer({ host: '127.0.0.1', botDelayMs: 10, audit: auditor.audit, ...options });
}

async function connect(label = `c${clients.length + 1}`) {
  const c = await TestClient.connect(srv.port, label);
  clients.push(c);
  return c;
}

async function createRoom(name = 'Hosty') {
  const host = await connect(name);
  host.send({ t: 'create', name });
  await host.waitFor('welcome');
  await host.waitForView();
  return host;
}

async function joinRoom(code, name) {
  const c = await connect(name);
  c.send({ t: 'join', room: code, name });
  await c.waitFor('welcome');
  await c.waitForView();
  return c;
}

async function lobbyOf(n) {
  const host = await createRoom('Ana');
  const code = host.welcome.room;
  const others = [];
  for (const name of ['Ben', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal'].slice(0, n - 1)) {
    others.push(await joinRoom(code, name));
  }
  await settle();
  const all = [host, ...others];
  for (const c of all) c.skipAll();
  return { host, code, others, all };
}

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const playerNames = (view) => view.players.map((p) => p.name);

beforeEach(() => start());
afterEach(async () => {
  try {
    auditor.verify(clients);
  } finally {
    await Promise.all(clients.map((c) => c.close()));
    await srv.close();
  }
});

// ---------------------------------------------------------------------------

describe('http', () => {
  it('GET /healthz returns 200', async () => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  it('serves the client', async () => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /html/);
    assert.match(await res.text(), /Cheese Thief/);
  });

  it('answers app-level pings', async () => {
    const c = await connect();
    c.send({ t: 'ping' });
    const pong = await c.waitFor('pong');
    assert.equal(typeof pong.serverNow, 'number');
  });
});

describe('lobby', () => {
  it('create gives a 4-letter code, a secret token, and makes you host', async () => {
    const host = await createRoom('Ana');
    assert.match(host.welcome.room, /^[A-HJKMNP-Z]{4}$/);
    assert.match(host.welcome.token, /^[A-Za-z0-9_-]{20,}$/);
    assert.equal(host.view.phase.name, 'LOBBY');
    assert.equal(host.view.room.hostId, host.id);
    assert.deepEqual(playerNames(host.view), ['Ana']);
  });

  it('join by code shows everyone the new player', async () => {
    const host = await createRoom('Ana');
    const ben = await joinRoom(host.welcome.room.toLowerCase(), 'Ben');
    const view = await host.waitForView((v) => v.players.length === 2);
    assert.deepEqual(playerNames(view), ['Ana', 'Ben']);
    assert.deepEqual(playerNames(ben.view), ['Ana', 'Ben']);
    assert.equal(ben.view.room.hostId, host.id);
  });

  it('unknown room code: ROOM_NOT_FOUND', async () => {
    const c = await connect();
    c.send({ t: 'join', room: 'ZZZZ', name: 'Ben' });
    const err = await c.expectError('ROOM_NOT_FOUND');
    assert.equal(err.for, 'join');
    assert.match(err.message, /expired/i);
  });

  it('rejects duplicate names, ignoring case and spacing', async () => {
    const host = await createRoom('Ana Banana');
    const c = await connect();
    c.send({ t: 'join', room: host.welcome.room, name: '  ana   BANANA ' });
    await c.expectError('NAME_TAKEN');
  });

  it('rejects bad names', async () => {
    const c = await connect();
    for (const name of ['', '   ', 'x'.repeat(17), 'bad\u0007bell', 42]) {
      c.send({ t: 'create', name });
      await c.expectError('BAD_NAME');
    }
  });

  it('caps the room at 8 players', async () => {
    const { code } = await lobbyOf(8);
    const c = await connect();
    c.send({ t: 'join', room: code, name: 'Ivy' });
    await c.expectError('ROOM_FULL');
  });

  it('a connection can only hold one seat', async () => {
    const host = await createRoom('Ana');
    host.send({ t: 'create', name: 'Again' });
    await host.expectError('ALREADY_SEATED');
  });

  it('host can kick in the lobby; the kicked token stops working', async () => {
    const { host, code, others } = await lobbyOf(3);
    const [ben] = others;
    const benToken = ben.welcome.token;
    host.send({ t: 'kick', playerId: ben.id });
    await ben.expectError('KICKED');
    const view = await host.waitForView((v) => v.players.length === 2);
    assert.deepEqual(playerNames(view), ['Ana', 'Cy']);
    const again = await connect('ben again');
    again.send({ t: 'hello', room: code, token: benToken });
    await again.expectError('SEAT_NOT_FOUND');
  });

  it('only the host can kick, and not themself', async () => {
    const { host, others } = await lobbyOf(3);
    others[0].send({ t: 'kick', playerId: others[1].id });
    await others[0].expectError('NOT_HOST');
    host.send({ t: 'kick', playerId: host.id });
    await host.expectError('BAD_TARGET');
  });

  it('host can change settings; others cannot; out-of-range values are refused', async () => {
    const { host, others } = await lobbyOf(2);
    host.send({ t: 'settings', settings: { discussionSec: 240, narratorOnHost: false } });
    const view = await others[0].waitForView((v) => v.room.settings.discussionSec === 240);
    assert.equal(view.room.settings.narratorOnHost, false);
    others[0].send({ t: 'settings', settings: { voteSec: 30 } });
    await others[0].expectError('NOT_HOST');
    host.send({ t: 'settings', settings: { hourSec: 1 } });
    await host.expectError('BAD_MESSAGE');
  });

  it('leaving the lobby frees the seat and passes host on', async () => {
    const { host, others } = await lobbyOf(3);
    host.send({ t: 'leave' });
    await host.waitFor('left');
    const view = await others[0].waitForView((v) => v.players.length === 2);
    assert.equal(view.room.hostId, others[0].id, 'longest-seated remaining player becomes host');
  });

  it('the room closes when the last person leaves', async () => {
    const host = await createRoom('Ana');
    const code = host.welcome.room;
    host.send({ t: 'leave' });
    await host.waitFor('left');
    assert.equal(srv.rooms.get(code), null);
  });
});

describe('reconnect', () => {
  it('a player can reclaim their seat with their token after the socket drops', async () => {
    const { host, code, others } = await lobbyOf(2);
    const [ben] = others;
    const { token } = ben.welcome;
    const benId = ben.id;
    await ben.close();
    let view = await host.waitForView((v) => v.players.find((p) => p.id === benId)?.connected === false);
    assert.ok(view);

    const back = await connect('ben back');
    back.send({ t: 'hello', room: code, token });
    const welcome = await back.waitFor('welcome');
    assert.equal(welcome.playerId, benId);
    view = await host.waitForView((v) => v.players.find((p) => p.id === benId)?.connected === true);
    assert.ok(view);
  });

  it('opening the seat on a second device replaces the first', async () => {
    const { code, others } = await lobbyOf(2);
    const [ben] = others;
    const twin = await connect('twin');
    twin.send({ t: 'hello', room: code, token: ben.welcome.token });
    await twin.waitFor('welcome');
    await ben.expectError('REPLACED');
    ben.send({ t: 'kick', playerId: twin.id });
    await ben.expectError('NOT_SEATED');
  });

  it('hello for a room that no longer exists: ROOM_NOT_FOUND', async () => {
    const c = await connect();
    c.send({ t: 'hello', room: 'QQQQ', token: 'a'.repeat(22) });
    await c.expectError('ROOM_NOT_FOUND');
  });
});

describe('expiry and restarts', () => {
  it('an idle room is deleted after 30 minutes and its players are told', async () => {
    const { host, code } = await lobbyOf(2);
    const room = srv.rooms.get(code);
    room.lastActivity -= 29 * 60 * 1000;
    srv.rooms.sweep();
    assert.ok(srv.rooms.get(code), 'not yet');
    room.lastActivity -= 2 * 60 * 1000;
    srv.rooms.sweep();
    assert.equal(srv.rooms.get(code), null);
    const closed = await host.waitFor('roomClosed');
    assert.equal(closed.reason, 'expired');
  });

  it('activity keeps a room alive', async () => {
    const { host, code } = await lobbyOf(2);
    const room = srv.rooms.get(code);
    room.lastActivity -= 31 * 60 * 1000;
    host.send({ t: 'settings', settings: { voteSec: 60 } });
    await host.waitForView((v) => v.room.settings.voteSec === 60);
    srv.rooms.sweep();
    assert.ok(srv.rooms.get(code));
  });

  it('pings from a phone with the room open count as activity', async () => {
    const { host, code } = await lobbyOf(2);
    const room = srv.rooms.get(code);
    room.lastActivity -= 31 * 60 * 1000;
    host.send({ t: 'ping' });
    await host.waitFor('pong');
    srv.rooms.sweep();
    assert.ok(srv.rooms.get(code));
  });

  it('a server shutdown tells everyone the room is gone', async () => {
    const { host } = await lobbyOf(2);
    const closing = host.waitFor('roomClosed');
    await srv.close('serverRestart');
    assert.equal((await closing).reason, 'serverRestart');
    srv = await createServer({ host: '127.0.0.1' }); // afterEach closes this one
  });
});

describe('rebuilding a room after a restart', () => {
  const saved = (extra = {}) => ({
    t: 'rejoin',
    room: 'ABCD',
    host: 'Ana',
    settings: { hourSec: 20, followerChoiceSec: 20, discussionSec: 240, voteSec: 45, narratorOnHost: false },
    bots: ['Whiskers'],
    round: 3,
    scores: [{ name: 'Ana', wins: 2, played: 3 }, { name: 'Ben', wins: 1, played: 3 }, { name: 'Whiskers', wins: 0, played: 3 }],
    ...extra,
  });

  it('the first phone back rebuilds the room: same code, settings, bots and scoreboard', async () => {
    const ben = await connect('Ben');
    ben.send(saved({ name: 'Ben' }));
    await ben.waitFor('welcome');
    const view = await ben.waitForView();
    assert.equal(view.room.code, 'ABCD');
    assert.equal(view.room.settings.discussionSec, 240);
    assert.equal(view.room.settings.narratorOnHost, false);
    assert.equal(view.room.round, 3);
    assert.deepEqual(playerNames(view), ['Ben', 'Whiskers']);
    const byName = Object.fromEntries(view.players.map((p) => [p.name, p.id]));
    assert.deepEqual(view.room.scores[byName.Ben], { wins: 1, played: 3 });
    assert.deepEqual(view.room.scores[byName.Whiskers], { wins: 0, played: 3 });
    assert.equal(view.room.hostId, ben.id, 'host until the old host is back');
  });

  it('others join by name, the old host gets the crown back and their score', async () => {
    const ben = await connect('Ben');
    ben.send(saved({ name: 'Ben' }));
    await ben.waitForView();
    const ana = await connect('Ana');
    ana.send(saved({ name: 'Ana', settings: { voteSec: 90 } })); // ignored: the room exists
    await ana.waitFor('welcome');
    const view = await ana.waitForView();
    assert.equal(view.room.hostId, ana.id);
    assert.equal(view.room.settings.voteSec, 45);
    assert.deepEqual(view.room.scores[ana.id], { wins: 2, played: 3 });
    await ben.waitForView((v) => v.room.hostId === ana.id);
  });

  it('a phone coming back with its old token is told the room was rebuilt', async () => {
    const ben = await connect('Ben');
    ben.send(saved({ name: 'Ben' }));
    await ben.waitForView();
    const ana = await connect('Ana');
    ana.send({ t: 'hello', room: 'ABCD', token: 'a'.repeat(22) });
    await ana.expectError('ROOM_RESTARTED');
  });

  it('only soon after the server starts, and never for a room that is running', async () => {
    const { code } = await lobbyOf(2);
    const late = await connect('Late');
    late.send(saved({ room: code, name: 'Ana' }));
    await late.expectError('NAME_TAKEN'); // the room exists, so this is an ordinary join

    srv.rooms.startedAt -= 16 * 60 * 1000;
    const c = await connect();
    c.send(saved({ name: 'Ben' }));
    await c.expectError('ROOM_NOT_FOUND');
    assert.equal(srv.rooms.get('ABCD'), null);
  });

  it('a server that is shutting down does not rebuild rooms', async () => {
    const c = await connect();
    srv.rooms.closeAll('serverRestart');
    c.send(saved({ name: 'Ben' }));
    await c.expectError('SERVER_RESTARTING');
    assert.equal(srv.rooms.get('ABCD'), null);
  });

  it('refuses scoreboards that do not add up', async () => {
    const c = await connect();
    c.send(saved({ name: 'Ben', scores: [{ name: 'Ben', wins: 4, played: 3 }] }));
    await c.expectError('BAD_MESSAGE');
    c.send(saved({ name: 'Ben', bots: Array(8).fill('Bot') }));
    await c.expectError('BAD_MESSAGE');
  });

  it('the round count is at least everyone\'s games played, and a new game counts on top', async () => {
    const ben = await connect('Ben');
    ben.send(saved({ name: 'Ben', round: 1, bots: ['Whiskers', 'Nibbles'] }));
    const view = await ben.waitForView();
    assert.equal(view.room.round, 3);
    const ana = await connect('Ana');
    ana.send(saved({ name: 'Ana' }));
    await ana.waitForView();
    ana.send({ t: 'start' });
    const started = await ana.waitForView((v) => v.phase.name !== 'LOBBY');
    assert.equal(started.room.round, 4);
  });
});

describe('bots', () => {
  it('host can add and remove bots, which count as players', async () => {
    const host = await createRoom('Ana');
    for (let i = 0; i < 3; i++) host.send({ t: 'addBot' });
    let view = await host.waitForView((v) => v.players.length === 4);
    const bots = view.players.filter((p) => p.isBot);
    assert.equal(bots.length, 3);
    assert.ok(bots.every((b) => b.isBot && b.connected));
    assert.equal(new Set(view.players.map((p) => p.name.toLowerCase())).size, view.players.length, 'bot names are unique');
    host.send({ t: 'removeBot', playerId: bots[0].id });
    view = await host.waitForView((v) => v.players.length === 3);
    host.send({ t: 'removeBot', playerId: host.id });
    await host.expectError('BAD_TARGET');
  });

  it('cannot add bots past 8 players', async () => {
    const host = await createRoom('Ana');
    for (let i = 0; i < 7; i++) host.send({ t: 'addBot' });
    await host.waitForView((v) => v.players.length === 8);
    host.send({ t: 'addBot' });
    await host.expectError('ROOM_FULL');
  });

  it('can be turned off on the server', async () => {
    await srv.close();
    await start({ enableBots: false });
    const host = await createRoom('Ana');
    assert.equal(host.view.room.botsEnabled, false);
    host.send({ t: 'addBot' });
    await host.expectError('BOTS_DISABLED');
  });

  it('confirm their role on their own once the game starts', async () => {
    const host = await createRoom('Ana');
    for (let i = 0; i < 3; i++) host.send({ t: 'addBot' });
    await host.waitForView((v) => v.players.length === 4);
    host.send({ t: 'start' });
    const view = await host.waitForView((v) => v.phase.name === 'ROLE_REVEAL' && v.reveal.doneIds.length === 3);
    assert.ok(!view.reveal.doneIds.includes(host.id));
  });
});

describe('starting a game', () => {
  it('needs 4 players and the host', async () => {
    const { host, others } = await lobbyOf(3);
    host.send({ t: 'start' });
    await host.expectError('NOT_ENOUGH_PLAYERS');
    const dee = await joinRoom(host.welcome.room, 'Dee');
    others[0].send({ t: 'start' });
    await others[0].expectError('NOT_HOST');
    assert.ok(dee);
  });

  it('deals each player their own role and die, and nothing else', async () => {
    const { host, all } = await lobbyOf(5);
    host.send({ t: 'start' });
    const views = await Promise.all(all.map((c) => c.waitForView((v) => v.phase.name === 'ROLE_REVEAL')));
    const thieves = views.filter((v) => v.me.role === 'thief');
    assert.equal(thieves.length, 1);
    for (const [i, v] of views.entries()) {
      assert.equal(v.me.id, all[i].id);
      assert.ok(v.me.die >= 1 && v.me.die <= 6);
    }
    // auditor.verify (afterEach) checks every message against what each player may know.
  });

  it('blocks late joiners once the game has started', async () => {
    const { host, code } = await lobbyOf(4);
    host.send({ t: 'start' });
    await host.waitForView((v) => v.phase.name === 'ROLE_REVEAL');
    const late = await connect('late');
    late.send({ t: 'join', room: code, name: 'Zed' });
    await late.expectError('GAME_IN_PROGRESS');
  });

  it('lobby-only actions are refused mid-game', async () => {
    const { host, others } = await lobbyOf(4);
    host.send({ t: 'start' });
    await host.waitForView((v) => v.phase.name === 'ROLE_REVEAL');
    for (const msg of [{ t: 'kick', playerId: others[0].id }, { t: 'addBot' }, { t: 'start' },
      { t: 'settings', settings: { voteSec: 60 } }]) {
      host.send(msg);
      await host.expectError('WRONG_PHASE');
    }
  });

  it('a player who refreshes mid-game gets their seat, role and die back', async () => {
    const { host, code, others } = await lobbyOf(4);
    host.send({ t: 'start' });
    const [ben] = others;
    const before = await ben.waitForView((v) => v.phase.name === 'ROLE_REVEAL');
    const { token } = ben.welcome;
    await ben.close();
    const back = await connect('ben back');
    back.send({ t: 'hello', room: code, token });
    const view = await back.waitForView();
    assert.deepEqual(view.me, before.me);
  });

  it('role confirmations go through the rules', async () => {
    const { host, all } = await lobbyOf(4);
    host.send({ t: 'start' });
    await host.waitForView((v) => v.phase.name === 'ROLE_REVEAL');
    all[1].send({ t: 'revealed' });
    const view = await host.waitForView((v) => v.reveal?.doneIds.length === 1);
    assert.deepEqual(view.reveal.doneIds, [all[1].id]);
    all[1].send({ t: 'revealed' });
    await all[1].expectError('ALREADY_DONE');
    all[2].send({ t: 'vote', playerId: all[0].id });
    await all[2].expectError('WRONG_PHASE');
  });
});

describe('bad input', () => {
  it('refuses non-JSON, unknown types, extra fields and bad ids', async () => {
    const c = await connect();
    for (const raw of ['not json', '[]', '{"t":"nope"}', '{"t":"ping","extra":1}', '{"t":"__proto__"}']) {
      c.send(raw);
      await c.expectError('BAD_MESSAGE');
    }
    c.send({ t: 'kick', playerId: 'x' });
    await c.expectError('NOT_SEATED');
    c.send({ t: 'kick', playerId: '../../etc' });
    await c.expectError('BAD_MESSAGE');
  });

  it('drops oversized messages', async () => {
    const c = await connect();
    c.send(JSON.stringify({ t: 'create', name: 'x'.repeat(5000) }));
    const code = await c.closed;
    assert.equal(code, 1009);
  });
});
