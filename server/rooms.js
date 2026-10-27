// All rooms on this server, in memory only (a restart or redeploy wipes them).

import { randomInt } from 'node:crypto';
import { Room } from './room.js';
import { CODE_ALPHABET, CODE_LENGTH } from './protocol.js';

export const ROOM_TTL_MS = 30 * 60 * 1000;

export class RoomManager {
  constructor({ ttlMs = ROOM_TTL_MS, now = Date.now, ...roomOptions } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.roomOptions = roomOptions;
    this.rooms = new Map();
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  create() {
    const code = this.newCode();
    const room = new Room(code, {
      ...this.roomOptions,
      now: this.now,
      onClose: (closed) => {
        if (this.rooms.get(closed.code) === closed) this.rooms.delete(closed.code);
      },
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(code) ?? null;
  }

  // Deletes rooms nobody has touched for ttlMs (PLAN.md §7).
  sweep() {
    const cutoff = this.now() - this.ttlMs;
    for (const room of [...this.rooms.values()]) {
      if (room.lastActivity < cutoff) room.close('expired');
    }
  }

  closeAll(reason) {
    for (const room of [...this.rooms.values()]) room.close(reason);
  }
}
