import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, cleanName, nameKey, INTENT_TYPES } from '../server/protocol.js';

const parse = (obj) => parseMessage(typeof obj === 'string' ? obj : JSON.stringify(obj));

describe('protocol', () => {
  it('accepts every intent type with valid fields', () => {
    const samples = {
      hello: { token: 'abcdefghijklmnopqrstuv', room: 'ABCD' },
      create: { name: 'Ana' },
      join: { room: 'abcd', name: 'Ben' },
      settings: { settings: { hourSec: 10, narratorOnHost: true } },
      look: { fur: 3, hat: 'bow' },
      kick: { playerId: 'a1b2c3' },
      removeBot: { playerId: 'a1b2c3' },
      peek: { playerId: 'a1b2c3' },
      chooseFollower: { playerId: 'a1b2c3' },
      vote: { playerId: 'a1b2c3' },
    };
    for (const t of INTENT_TYPES) {
      const res = parse({ t, ...(samples[t] ?? {}) });
      assert.equal(res.error, undefined, `${t}: ${res.error} ${res.field ?? ''}`);
      assert.equal(res.msg.t, t);
    }
  });

  it('accepts only known mouse looks', () => {
    assert.deepEqual(parse({ t: 'look', fur: 0, hat: 'none' }).msg, { t: 'look', fur: 0, hat: 'none' });
    for (const bad of [{ fur: 8, hat: 'bow' }, { fur: -1, hat: 'bow' }, { fur: 1.5, hat: 'bow' }, { fur: '2', hat: 'bow' },
      { fur: 2, hat: 'mask' }, { fur: 2 }, { hat: 'bow' }, { fur: 2, hat: 'bow', extra: 1 }]) {
      assert.equal(parse({ t: 'look', ...bad }).error, 'BAD_MESSAGE', JSON.stringify(bad));
    }
  });

    it('normalises room codes and names', () => {
    assert.deepEqual(parse({ t: 'join', room: ' abcd ', name: '  Big   Cheese ' }).msg,
      { t: 'join', room: 'ABCD', name: 'Big Cheese' });
  });

  it('refuses malformed messages', () => {
    for (const bad of ['', 'null', '1', '"x"', '[]', '{}', '{"t":1}', '{"t":"toString"}', '{"t":"constructor"}',
      { t: 'join', room: 'ABCD' }, { t: 'join', room: 'ABC', name: 'x' }, { t: 'join', room: 'ABCI', name: 'x' },
      { t: 'ping', x: 1 }, { t: 'vote', playerId: 'A B' }, { t: 'vote' }, { t: 'hello', token: 'short', room: 'ABCD' },
      { t: 'settings', settings: {} }, { t: 'settings', settings: { hourSec: 4 } },
      { t: 'settings', settings: { hourSec: 10.5 } }, { t: 'settings', settings: { evil: 1 } },
      { t: 'settings', settings: { narratorOnHost: 'yes' } }, { t: 'settings', settings: [] }]) {
      assert.ok(parse(bad).error, `should refuse ${JSON.stringify(bad)}`);
    }
    assert.equal(parseMessage('x'.repeat(3000)).error, 'BAD_MESSAGE');
  });

  it('validates names', () => {
    assert.equal(cleanName('Ana'), 'Ana');
    assert.equal(cleanName('🧀 Brie'), '🧀 Brie');
    assert.equal(cleanName('x'.repeat(16)), 'x'.repeat(16));
    for (const bad of ['', '  ', 'x'.repeat(17), 'a\u0000b', 'a​b', null, 7]) assert.equal(cleanName(bad), undefined);
    assert.equal(parse({ t: 'create', name: '' }).error, 'BAD_NAME');
  });

  it('treats names that only differ by case or width as duplicates', () => {
    assert.equal(nameKey('Ana'), nameKey('ANA'));
    assert.equal(nameKey('Ana'), nameKey('Ａｎａ'));
  });
});
