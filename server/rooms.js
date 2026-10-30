// All rooms on this server, in memory only (a restart or redeploy wipes them). Players'
// phones rebuild their rooms after a restart (see restore).

import { randomInt } from 'node:crypto';
import { Room } from './room.js';
import { CODE_ALPHABET, CODE_LENGTH } from './protocol.js';

export const ROOM_TTL_MS = 30 * 60 * 1000;
// Rooms can only be rebuilt with a chosen code this soon after the server starts.
export const RESTORE_WINDOW_MS = 15 * 60 * 1000;

export class RoomManager {
  constructor({ ttlMs = ROOM_TTL_MS, now = Date.now, ...roomOptions } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.roomOptions = roomOptions;
    this.rooms = new Map();
    this.startedAt = now();
    this.closing = false;
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  create(code = this.newCode()) {
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

  // A restarted server lets the first phone back rebuild its room under the same code.
  // A server that is shutting down doesn't: that room would be lost again.
  canRestore() {
    return !this.closing && this.now() - this.startedAt < RESTORE_WINDOW_MS;
  }

  restore(code, saved, firstName) {
    const room = this.create(code);
    room.restoreFrom(saved, firstName);
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
    this.closing = true;
    for (const room of [...this.rooms.values()]) room.close(reason);
  }
}
