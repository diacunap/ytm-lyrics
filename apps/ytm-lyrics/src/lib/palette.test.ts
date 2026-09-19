import { describe, expect, test } from 'bun:test';

import { PALETTE_SIZE, luminance, pickPalette, themeFromPixels, type Rgb } from './palette';

function image(blocks: Array<{ rgb: Rgb; count: number; alpha?: number }>): Uint8ClampedArray {
  const px: number[] = [];
  for (const b of blocks) for (let i = 0; i < b.count; i++) px.push(b.rgb[0], b.rgb[1], b.rgb[2], b.alpha ?? 255);
  return new Uint8ClampedArray(px);
}

const dist = (a: Rgb, b: Rgb) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

describe('pickPalette', () => {
  test('always yields the full palette, even from one flat color', () => {
    const p = pickPalette(image([{ rgb: [20, 60, 200], count: 50 }]));
    expect(p).toHaveLength(PALETTE_SIZE);
    // fillers are hue-shifted relatives, so they differ from the lead and from each other
    for (let i = 1; i < p.length; i++) expect(dist(p[i], p[0])).toBeGreaterThan(30);
  });

  test('a saturated color beats a slightly more common grey', () => {
    const [first] = pickPalette(
      image([
        { rgb: [128, 128, 128], count: 60 },
        { rgb: [220, 30, 40], count: 50 },
      ]),
    );
    expect(first[0]).toBeGreaterThan(200);
    expect(first[1]).toBeLessThan(60);
  });

  test('picked colors are mutually distinct', () => {
    const p = pickPalette(
      image([
        { rgb: [10, 40, 200], count: 100 },
        { rgb: [12, 42, 205], count: 90 },
        { rgb: [240, 200, 20], count: 30 },
        { rgb: [20, 200, 90], count: 25 },
      ]),
    );
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(dist(p[i], p[j])).toBeGreaterThan(30);
  });

  test('ignores transparent pixels and survives an empty image', () => {
    const p = pickPalette(image([{ rgb: [255, 0, 0], count: 10, alpha: 0 }]));
    expect(p[0]).toEqual([40, 40, 60]);
    expect(p).toHaveLength(PALETTE_SIZE);
  });
});

describe('theme', () => {
  test('a pale cover flips to the light theme', () => {
    const px = image([
      { rgb: [245, 240, 235], count: 80 },
      { rgb: [200, 40, 60], count: 10 },
    ]);
    expect(luminance(px)).toBeGreaterThan(0.62);
    expect(themeFromPixels(px).light).toBe(true);
  });
  test('a dark cover stays dark', () => {
    const px = image([
      { rgb: [20, 20, 30], count: 80 },
      { rgb: [200, 40, 60], count: 10 },
    ]);
    expect(themeFromPixels(px).light).toBe(false);
  });
});
