// Checks one server -> client message as it arrived over the socket.
// Strict allowlists at every level: any unexpected key fails, so new fields can't
// slip out unnoticed. Game data is then checked with the independent entitlement checker.

import assert from 'node:assert/strict';
import { assertEntitled } from './entitlement.js';
import { DEFAULT_SETTINGS } from '../../server/room.js';

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);
const GAME_KEYS = ['phase', 'me', 'night', 'reveal', 'follower', 'vote', 'results'];

function onlyKeys(obj, allowed, where) {
  assert.ok(obj && typeof obj === 'object', `${where} must be an object`);
  for (const key of Object.keys(obj)) assert.ok(allowed.includes(key), `${where} has unexpected key "${key}"`);
}

// ctx: { seatId, token, game } where game is the state the message was built from
// (null in the lobby) and token is this player's own seat token.
export function assertWireMessage(msg, ctx) {
  const where = (p) => `[seat ${ctx.seatId}] ${msg.t}.${p}`;
  switch (msg.t) {
    case 'welcome':
      assert.deepEqual(Object.keys(msg).sort(), ['playerId', 'room', 't', 'token']);
      assert.equal(msg.playerId, ctx.seatId, where('playerId'));
      assert.equal(msg.token, ctx.token, where('token is someone else\'s'));
      return;
    case 'error':
      onlyKeys(msg, ['t', 'code', 'message', 'for'], where('error'));
      return;
    case 'pong':
      onlyKeys(msg, ['t', 'serverNow'], where('pong'));
      return;
    case 'roomClosed':
      onlyKeys(msg, ['t', 'reason'], where('roomClosed'));
      return;
    case 'left':
      onlyKeys(msg, ['t'], where('left'));
      return;
    case 'view':
      break;
    default:
      assert.fail(`unexpected message type ${msg.t}`);
  }

  onlyKeys(msg, ['t', 'serverNow', 'room', 'players', ...GAME_KEYS], where('view'));
  assert.equal(typeof msg.serverNow, 'number');
  onlyKeys(msg.room, ['code', 'hostId', 'settings', 'botsEnabled', 'round', 'scores'], where('room'));
  onlyKeys(msg.room.settings, SETTINGS_KEYS, where('room.settings'));
  assert.equal(typeof msg.room.round, 'number', where('room.round'));
  for (const score of Object.values(msg.room.scores)) onlyKeys(score, ['wins', 'played'], where('room.scores[]'));
  // The scoreboard never changes before a game's results are out.
  if (ctx.game && ctx.game.phase !== 'RESULTS') {
    for (const score of Object.values(msg.room.scores)) assert.ok(score.played < msg.room.round, where('scores before the results'));
  }
  assert.ok(Array.isArray(msg.players), where('players'));
  for (const p of msg.players) onlyKeys(p, ['id', 'name', 'connected', 'isBot', 'isHost'], where('players[]'));

  // No seat token other than your own may appear anywhere, ever.
  const text = JSON.stringify(msg);
  for (const token of ctx.allTokens ?? []) {
    if (token !== ctx.token) assert.ok(!text.includes(token), where('contains another seat\'s token'));
  }
  assert.ok(!/"token":/.test(text), where('views never carry tokens'));

  if (!ctx.game) {
    assert.deepEqual(msg.phase, { name: 'LOBBY' }, where('phase'));
    assert.deepEqual(msg.me, { id: ctx.seatId }, where('me'));
    onlyKeys(msg, ['t', 'serverNow', 'room', 'players', 'phase', 'me'], where('lobby view'));
    return;
  }

  const gameView = {};
  for (const key of GAME_KEYS) if (key in msg) gameView[key] = msg[key];
  // Timers are public; strip them before the game-data check.
  if (gameView.phase) {
    onlyKeys(gameView.phase, ['name', 'hour', 'endsAt'], where('phase'));
    const { endsAt, ...phase } = gameView.phase;
    if (endsAt !== undefined) assert.equal(typeof endsAt, 'number', where('phase.endsAt'));
    gameView.phase = phase;
  }
  assertEntitled(ctx.game, ctx.seatId, gameView, 'wire');
}
