import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

describe('service worker', () => {
  it('caches every file the app needs (so a cold start shows the waking-up screen)', () => {
    const source = readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
    const list = source.match(/const SHELL = \[([\s\S]*?)\];/)[1];
    const shell = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const expected = filesUnder(PUBLIC)
      .map((f) => `/${path.relative(PUBLIC, f).split(path.sep).join('/')}`)
      .filter((f) => f !== '/sw.js');
    assert.deepEqual(shell.filter((f) => f !== '/').sort(), expected.sort());
    assert.ok(shell.includes('/'));
  });
});
