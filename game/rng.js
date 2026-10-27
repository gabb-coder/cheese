// Random number sources for game/rules.js. Each is a function returning a float in [0, 1).
// Rules never call Math.random directly, so tests can replay any deal from a seed.

import { randomBytes } from 'node:crypto';

// mulberry32: small, fast, deterministic. For tests and debug replays only.
export function seededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Production source: unpredictable, so nobody can work out the deal from timing or seeds.
export function cryptoRng() {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48; // 48 random bits -> [0, 1)
}
