import { describe, expect, test } from 'bun:test';

import { lookupFacts, pickHit, styleFor } from './deezer';
import type { Http } from './lrclib';

const hits = [
  { id: 1, title: 'Where Our Blue Is', duration: 196, artist: { name: 'Tatsuya Kitani' } },
  { id: 2, title: 'Where Our Blue Is (Acoustic version)', duration: 203, artist: { name: 'Tatsuya Kitani' } },
  { id: 3, title: 'Love Song (cover)', duration: 165 },
  { id: 4, title: 'Where Our Blue Is - From THE FIRST TAKE', duration: 197 },
];

function http(routes: Record<string, { status: number; body: unknown }>): Http & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const path = new URL(url).pathname;
    const hit = routes[path];
    return hit ? { status: hit.status, text: JSON.stringify(hit.body) } : { status: 404, text: '' };
  }) as Http & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe('pickHit', () => {
  test('duration decides between versions, then the exact title', () => {
    expect(pickHit(hits, 'Where Our Blue Is', 204_000)?.id).toBe(2);
    expect(pickHit(hits, 'Where Our Blue Is', 196_000)?.id).toBe(1);
  });
  test('nothing in range gives null', () => {
    expect(pickHit(hits, 'Where Our Blue Is', 300_000)).toBeNull();
  });
  test('without a duration the best title wins', () => {
    expect(pickHit(hits, 'Where Our Blue Is', null)?.id).toBe(1);
  });
});

describe('lookupFacts', () => {
  const key = { title: 'Around the World', artist: 'Daft Punk', durationMs: 429_000 };
  test('search, track detail and album genres, rounding the bpm', async () => {
    const h = http({
      '/search': { status: 200, body: { data: [{ id: 3129775, title: 'Around the World', duration: 429 }] } },
      '/track/3129775': {
        status: 200,
        body: { title: 'Around the World', bpm: 121.23, gain: -11.2, preview: 'https://p/x.mp3', release_date: '1997-01-17', artist: { name: 'Daft Punk' }, album: { id: 5, cover_xl: 'https://c/xl.jpg' } },
      },
      '/album/5': { status: 200, body: { genres: { data: [{ name: 'Electro' }, { name: 'Dance' }] } } },
    });
    const facts = await lookupFacts(h, key);
    expect(facts).toMatchObject({ bpm: 121.2, bpmSource: 'deezer', gainDb: -11.2, energy: null, title: 'Around the World', artist: 'Daft Punk', year: 1997, genres: ['Electro', 'Dance'], style: 'grid', previewUrl: 'https://p/x.mp3', coverUrl: 'https://c/xl.jpg', source: 'deezer:3129775' });
    expect(new URL(h.calls[0]).searchParams.get('q')).toBe('Daft Punk Around the World');
  });
  test('a zero bpm means deezer has not analysed it; the preview stays for us to analyse', async () => {
    const h = http({
      '/search': { status: 200, body: { data: [{ id: 9, title: 'Dramaturgy', duration: 238 }] } },
      '/track/9': { status: 200, body: { bpm: 0, gain: -4.9, preview: 'https://p/d.mp3', album: { id: 7 } } },
      '/album/7': { status: 200, body: { genres: { data: [{ name: 'Rock' }] } } },
    });
    const facts = await lookupFacts(h, { title: 'Dramaturgy', artist: 'Eve', durationMs: 238_000 });
    expect(facts).toMatchObject({ bpm: null, bpmSource: null, gainDb: -4.9, style: 'sharp', previewUrl: 'https://p/d.mp3', year: null });
  });
  test('a missing album still yields facts', async () => {
    const h = http({
      '/search': { status: 200, body: { data: [{ id: 9, title: 'X', duration: 238 }] } },
      '/track/9': { status: 200, body: { bpm: 100 } },
    });
    expect((await lookupFacts(h, { title: 'X', artist: 'Y', durationMs: 238_000 }))?.style).toBe('round');
  });
  test('no hits or a failing api gives null', async () => {
    expect(await lookupFacts(http({ '/search': { status: 200, body: { data: [] } } }), key)).toBeNull();
    expect(await lookupFacts(http({ '/search': { status: 503, body: {} } }), key)).toBeNull();
  });
});

describe('styleFor', () => {
  test.each([
    [['Metal'], 'sharp'],
    [['J-Pop'], 'round'],
    [['Electro', 'Pop'], 'grid'],
    [['Jazz'], 'calm'],
    [[], 'round'],
  ])('%j → %s', (genres, style) => {
    expect(styleFor(genres as string[])).toBe(style as ReturnType<typeof styleFor>);
  });
});
