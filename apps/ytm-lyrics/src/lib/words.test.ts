import { describe, expect, test } from 'bun:test';

import { hyphenate, lineWindow, splitWords, wordFill, wordSpans } from './words';

const lines = [
  { startMs: 1000, text: 'around the world' },
  { startMs: 3000, text: 'again' },
  { startMs: 30_000, text: 'last one' },
];

describe('splitWords', () => {
  test('splits on whitespace and remembers spaces', () => {
    expect(splitWords('  around the  world ')).toEqual([
      { text: 'around', trailingSpace: true },
      { text: 'the', trailingSpace: true },
      { text: 'world', trailingSpace: false },
    ]);
  });
  test('segments japanese without spaces into more than one piece', () => {
    const parts = splitWords('青のすみか');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map(p => p.text).join('')).toBe('青のすみか');
  });
  test('empty text gives nothing', () => {
    expect(splitWords('   ')).toEqual([]);
  });
});

describe('lineWindow', () => {
  test('ends where the next line starts', () => {
    expect(lineWindow(lines, 0)).toEqual({ startMs: 1000, endMs: 3000 });
  });
  test('caps a long gap', () => {
    expect(lineWindow(lines, 1)).toEqual({ startMs: 3000, endMs: 11_000 });
  });
  test('last line gets the cap', () => {
    expect(lineWindow(lines, 2)).toEqual({ startMs: 30_000, endMs: 38_000 });
  });
  test('an instrumental marker pins the end before the next lyric', () => {
    const marked = [
      { startMs: 0, text: 'a', endMs: 2500 },
      { startMs: 20_000, text: 'b' },
    ];
    expect(lineWindow(marked, 0)).toEqual({ startMs: 0, endMs: 2500 });
  });
  test('never shorter than the minimum', () => {
    expect(lineWindow([{ startMs: 0, text: 'a' }, { startMs: 100, text: 'b' }], 0).endMs).toBe(800);
  });
});

describe('wordSpans', () => {
  test('weights by character count and covers the whole window', () => {
    const spans = wordSpans(lines, 0);
    expect(spans.map(s => s.text)).toEqual(['around', 'the', 'world']);
    expect(spans[0].startMs).toBe(1000);
    // the last 12% of the window is the breath before the next line
    expect(spans[2].endMs).toBe(2760);
    // 6 + 3 + 5 = 14 chars over the 1760ms sung part
    expect(spans[0].endMs).toBe(Math.round(1000 + (1760 * 6) / 14));
    expect(spans[1].startMs).toBe(spans[0].endMs);
  });
  test('out of range is empty', () => {
    expect(wordSpans(lines, -1)).toEqual([]);
    expect(wordSpans(lines, 3)).toEqual([]);
  });
});

describe('wordFill', () => {
  const w = { text: 'x', startMs: 100, endMs: 300, trailingSpace: false };
  test.each([
    [0, 0],
    [100, 0],
    [200, 0.5],
    [300, 1],
    [999, 1],
  ])('at %i → %f', (pos, fill) => {
    expect(wordFill(w, pos)).toBeCloseTo(fill);
  });
});

describe('hyphenate', () => {
  const SH = '\u00ad';
  test('short words are untouched', () => {
    expect(hyphenate('korogatteku')).toBe('korogatteku');
    expect(hyphenate('world')).toBe('world');
  });
  test('long romaji breaks after vowels, never leaving a tiny tail', () => {
    const h = hyphenate('mitsumeteitakattanda');
    expect(h.split(SH).every(part => part.length >= 5)).toBe(true);
    expect(h.replace(new RegExp(SH, 'g'), '')).toBe('mitsumeteitakattanda');
    expect(h.split(SH).length).toBeGreaterThan(1);
  });
  test('long english compounds break too', () => {
    expect(hyphenate('supercalifragilistic').split(SH).length).toBeGreaterThan(2);
  });
  test('cjk and mixed scripts are left alone', () => {
    expect(hyphenate('感情的にはなれないよ今更臆病')).toBe('感情的にはなれないよ今更臆病');
    expect(hyphenate('abc123def456ghi789')).toBe('abc123def456ghi789');
  });
});
