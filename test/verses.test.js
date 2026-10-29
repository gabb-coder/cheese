import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VERSES, NOTICES } from '../public/js/verses.js';

// The verse text itself is checked by hand against the published NIV and CNVS (it was
// taken from BibleGateway's text, never retyped). These checks catch damage to it.
describe('Bible verses (Home screen easter egg)', () => {
  it('has a good set of verses, each in both translations with a reference', () => {
    assert.ok(VERSES.length >= 20);
    for (const v of VERSES) {
      for (const key of ['ref', 'zhRef', 'en', 'zh']) assert.ok(v[key]?.trim(), `${v.ref} ${key}`);
      assert.match(v.ref, /^[1-3]? ?[A-Z][a-z]+ \d+:\d+(-\d+)?$/, v.ref);
      assert.match(v.zhRef, /^[一-鿿]+ \d+:\d+(-\d+)?$/, v.zhRef);
      assert.equal(v.ref.split(' ').pop(), v.zhRef.split(' ').pop(), `${v.ref} chapter and verse match`);
    }
    assert.equal(new Set(VERSES.map((v) => v.ref)).size, VERSES.length, 'no verse twice');
  });

  it('carries no leftovers from the web page (verse numbers, footnote marks, links)', () => {
    for (const v of VERSES) {
      for (const text of [v.en, v.zh]) {
        assert.doesNotMatch(text, /Read full chapter|\[[a-z]\]|\([A-Z]\)|<|>|&[a-z]+;/, v.ref);
        assert.doesNotMatch(text, /^\d|\s\d+\s/, `${v.ref} has a stray verse number`);
        assert.equal((text.match(/⟪/g) ?? []).length, (text.match(/⟫/g) ?? []).length, `${v.ref} small caps`);
      }
      assert.doesNotMatch(v.zh, /[A-Za-z]/, `${v.ref} Chinese text has Latin letters`);
    }
  });

  it('keeps the copyright notices for both translations', () => {
    assert.match(NOTICES.en, /New International Version.*Biblica/);
    assert.match(NOTICES.zh, /圣经新译本.*Worldwide Bible Society/);
  });
});
