import { beforeAll, describe, expect, test } from 'bun:test';

import { parseDict, type JaDict } from './romaji';
import { beatsFor, estimateBpm, msPerBeat, syllables } from './tempo';
import { wordSpans } from './words';

let dict: JaDict;
beforeAll(async () => {
  const gz = await Bun.file(new URL('../../public/ja-dict.bin.gz', import.meta.url)).arrayBuffer();
  dict = parseDict(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(gz))));
});

describe('syllables', () => {
  test.each([
    ['around', 2],
    ['the', 1],
    ['world', 1],
    ['harder', 2],
    ['stronger', 2],
    ['make', 1],
    ['corazón', 3],
    ['', 1],
  ])('%s → %i', (w, n) => {
    expect(syllables(w)).toBe(n);
  });
});

describe('beatsFor', () => {
  test('japanese words count morae through the dictionary', () => {
    const beats = beatsFor(dict);
    expect(beats('季節')).toBe(3); // きせつ
    expect(beats('感情的')).toBe(6); // かんじょうてき: じょ is one mora
    expect(beats('ドクドクドク')).toBe(6);
  });
  test('latin words count syllables', () => {
    expect(beatsFor(null)('around')).toBe(2);
  });
});

describe('msPerBeat', () => {
  const beats = beatsFor(null);
  test('median over tight lines, ignoring long gaps', () => {
    const lines = [
      { startMs: 0, text: 'around the world' }, // 4 beats over 2000 -> 500
      { startMs: 2000, text: 'around the world' }, // 4 beats over 1200 -> 300
      { startMs: 3200, text: 'around the world' }, // 4 beats over 1600 -> 400
      { startMs: 4800, text: 'solo' }, // gap 20s: ignored
      { startMs: 24_800, text: 'end' },
    ];
    expect(msPerBeat(lines, beats)).toBe(340); // median 400 * 0.85 sung share
  });
  test('default when nothing is tight', () => {
    expect(msPerBeat([{ startMs: 0, text: 'a' }, { startMs: 30_000, text: 'b' }], beats)).toBe(220);
  });
});

describe('wordSpans with tempo', () => {
  test('a line before a long gap only fills its sung part', () => {
    const lines = [
      { startMs: 0, text: 'around the world' },
      { startMs: 8000, text: 'again' },
    ];
    const spans = wordSpans(lines, 0, { beats: beatsFor(null), msPerBeat: 300 });
    // 4 beats * 300ms * 1.1 stretch = 1320ms sung, then silence until 8000
    expect(spans[spans.length - 1].endMs).toBe(1320);
    expect(spans[0].endMs).toBe(660); // "around" is 2 of 4 beats
  });
  test('a tight line finishes before the breath at the end of its window', () => {
    const lines = [
      { startMs: 0, text: 'around the world' },
      { startMs: 1000, text: 'again' },
    ];
    const spans = wordSpans(lines, 0, { beats: beatsFor(null), msPerBeat: 300 });
    expect(spans[spans.length - 1].endMs).toBe(880);
  });
});

describe('estimateBpm', () => {
  test('clamps to a musical range', () => {
    expect(estimateBpm(300)).toBe(133);
    expect(estimateBpm(90)).toBe(180);
    expect(estimateBpm(700)).toBe(60);
  });
});
