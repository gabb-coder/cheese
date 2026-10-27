import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, createGame, applyIntent, advance, stealDeadline, viewFor } from '../game/rules.js';
import { seededRng } from '../game/rng.js';
import { botIntent } from '../server/bots.js';
import { ids } from './helpers/simulate.js';

// A bot sees exactly what a phone would: its own game view plus the public player list.
const botView = (game, id) => ({ ...viewFor(game, id), players: game.playerIds.map((p) => ({ id: p })) });

describe('bots', () => {
  it('only ever choose legal moves, and an all-bot game reaches the results', () => {
    for (const n of [4, 5, 6, 7, 8]) {
      for (let seed = 0; seed < 40; seed++) {
        const rng = seededRng(seed);
        let game = createGame(ids(n), rng);
        let steals = 0;
        while (game.phase !== PHASE.RESULTS) {
          for (const id of game.playerIds) {
            const intent = botIntent(botView(game, id), rng);
            if (!intent) continue;
            const res = applyIntent(game, id, intent);
            assert.equal(res.error, undefined, `${game.phase} ${intent.t}: ${res.error}`);
            if (intent.t === 'steal') steals++;
            game = res.game;
          }
          game = stealDeadline(game).game;
          game = advance(game, rng).game;
        }
        assert.equal(steals, 1, 'the bot Thief steals on its hour');
        assert.equal(game.followerPickedBy, 'thief', 'the bot Thief chooses its Follower');
        assert.equal(Object.keys(game.votes).length, n, 'every bot votes');
      }
    }
  });
});
