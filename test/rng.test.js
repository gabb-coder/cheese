import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cryptoRng, seededRng } from '../game/rng.js';
import { createGame } from '../game/rules.js';
import { ids } from './helpers/simulate.js';

describe('random sources', () => {
  for (const [name, rng] of [['crypto', cryptoRng], ['seeded', seededRng(7)]]) {
    it(`${name}: returns floats in [0, 1) and can deal a game`, () => {
      const values = Array.from({ length: 5000 }, () => rng());
      assert.ok(values.every((v) => Number.isFinite(v) && v >= 0 && v < 1));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      assert.ok(Math.abs(mean - 0.5) < 0.03, `mean ${mean}`);
      assert.doesNotThrow(() => createGame(ids(8), rng));
    });
  }
});
