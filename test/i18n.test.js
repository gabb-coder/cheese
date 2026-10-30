import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// public/js/i18n.js runs in the browser, so read its dictionaries as text.
const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js');
const source = readFileSync(path.join(JS, 'i18n.js'), 'utf8');

function dictionary(name) {
  const body = source.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`))[1];
  const entries = new Map();
  for (const m of body.matchAll(/^ {2}'?([\w.]+)'?: (.*)$/gm)) entries.set(m[1], m[2]);
  return entries;
}

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const en = dictionary('EN');
  const zh = dictionary('ZH');

  it('Chinese has every English string', () => {
    const missing = [...en.keys()].filter((key) => !zh.has(key));
    assert.deepEqual(missing, []);
  });

  it('every Chinese server error matches a real error code', async () => {
    const { ERROR_TEXT } = await import('../server/protocol.js');
    const codes = [...zh.keys()].filter((key) => key.startsWith('err.')).map((key) => key.slice(4));
    assert.deepEqual(codes.sort(), Object.keys(ERROR_TEXT).sort());
  });

  it('both languages fill in the same placeholders', () => {
    for (const [key, text] of en) {
      if (!zh.has(key) || text.startsWith('(')) continue; // functions take named arguments
      assert.deepEqual(placeholders(zh.get(key)), placeholders(text), key);
    }
  });

  it('every key the screens use exists', () => {
    const files = [path.join(JS, 'main.js'), path.join(JS, 'components.js'), path.join(JS, 'narrator.js'), path.join(JS, 'clock.js'), path.join(JS, 'reactions.js'), path.join(JS, 'sharecard.js'),
      ...readdirSync(path.join(JS, 'screens')).map((f) => path.join(JS, 'screens', f))];
    const used = new Set();
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\btx?\(\s*'([\w.]+)'/g)) used.add(m[1]);
    }
    assert.ok(used.size > 100, `expected many keys, found ${used.size}`);
    assert.deepEqual([...used].filter((key) => !en.has(key)), []);
  });
});
