// Pairs every view a client received with the game state the server built it from
// (via the room's audit hook), then checks each message with assertWireMessage.

import assert from 'node:assert/strict';
import { assertWireMessage } from './wire.js';

export function createAuditor() {
  const audits = new Map(); // seatId -> [{ text, game, used }]
  return {
    audit(seatId, msg, game) {
      if (!audits.has(seatId)) audits.set(seatId, []);
      audits.get(seatId).push({ text: JSON.stringify(msg), game, used: false });
    },
    verify(clients) {
      const allTokens = clients.flatMap((c) => c.messages.filter((m) => m.t === 'welcome').map((m) => m.token));
      let checked = 0;
      for (const c of clients) {
        let seatId = null;
        let token = null;
        for (const msg of c.messages) {
          if (msg.t === 'welcome') {
            seatId = msg.playerId;
            token = msg.token;
          }
          let game = null;
          if (msg.t === 'view') {
            const text = JSON.stringify(msg);
            const entry = (audits.get(seatId) ?? []).find((a) => !a.used && a.text === text);
            assert.ok(entry, `${c.label}: received a view the server never built for seat ${seatId}`);
            entry.used = true;
            game = entry.game;
          }
          assertWireMessage(msg, { seatId, token, game, allTokens });
          checked++;
        }
      }
      return checked;
    },
  };
}
