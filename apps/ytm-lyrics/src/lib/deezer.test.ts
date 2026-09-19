import { describe, expect, test } from 'bun:test';

import { lookupFacts, pickHit } from './deezer';
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
  test('search then track detail, rounding the bpm', async () => {
    const h = http({
      '/search': { status: 200, body: { data: [{ id: 3129775, title: 'Around the World', duration: 429 }] } },
      '/track/3129775': { status: 200, body: { bpm: 121.23, gain: -11.2 } },
    });
    expect(await lookupFacts(h, key)).toEqual({ bpm: 121.2, gainDb: -11.2, source: 'deezer:3129775' });
    expect(new URL(h.calls[0]).searchParams.get('q')).toBe('Daft Punk Around the World');
  });
  test('a zero bpm means deezer has not analysed it', async () => {
    const h = http({
      '/search': { status: 200, body: { data: [{ id: 9, title: 'Dramaturgy', duration: 238 }] } },
      '/track/9': { status: 200, body: { bpm: 0, gain: -4.9 } },
    });
    expect(await lookupFacts(h, { title: 'Dramaturgy', artist: 'Eve', durationMs: 238_000 })).toEqual({ bpm: null, gainDb: -4.9, source: 'deezer:9' });
  });
  test('no hits or a failing api gives null', async () => {
    expect(await lookupFacts(http({ '/search': { status: 200, body: { data: [] } } }), key)).toBeNull();
    expect(await lookupFacts(http({ '/search': { status: 503, body: {} } }), key)).toBeNull();
  });
});
