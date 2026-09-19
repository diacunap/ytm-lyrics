import { describe, expect, test } from 'bun:test';

import { lookup, type Http } from './lrclib';

const key = { title: 'Where Our Blue Is', artist: 'Tatsuya Kitani', durationMs: 204_000 };

function http(routes: Record<string, { status: number; body: unknown }>): Http & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const path = new URL(url).pathname;
    const hit = routes[path];
    if (!hit) return { status: 404, text: '' };
    return { status: hit.status, text: typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body) };
  }) as Http & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const synced = (id: number, duration: number, extra: object = {}) => ({
  id,
  trackName: 'Where Our Blue Is',
  artistName: 'Tatsuya Kitani',
  duration,
  syncedLyrics: '[00:01.00]one\n[00:02.00]two',
  plainLyrics: 'one\ntwo',
  ...extra,
});

describe('lookup', () => {
  test('uses the exact match when /get answers 200', async () => {
    const h = http({ '/api/get': { status: 200, body: synced(7, 204) } });
    const lyrics = await lookup(h, key);
    expect(lyrics?.source).toBe('lrclib:7');
    expect(lyrics?.synced).toEqual([
      { startMs: 1000, text: 'one' },
      { startMs: 2000, text: 'two' },
    ]);
    expect(h.calls).toHaveLength(1);
    const q = new URL(h.calls[0]).searchParams;
    expect(q.get('duration')).toBe('204');
    expect(q.has('album_name')).toBe(false);
  });

  test('falls back to search on 404 and picks by duration', async () => {
    const h = http({
      '/api/search': { status: 200, body: [synced(1, 197), synced(2, 204), synced(3, 328)] },
    });
    expect((await lookup(h, key))?.source).toBe('lrclib:2');
    expect(h.calls.map(u => new URL(u).pathname)).toEqual(['/api/get', '/api/search']);
  });

  test('falls back to search when /get is overloaded (503)', async () => {
    const h = http({
      '/api/get': { status: 503, body: { name: 'ServerOverloaded' } },
      '/api/search': { status: 200, body: [synced(2, 204)] },
    });
    expect((await lookup(h, key))?.source).toBe('lrclib:2');
  });

  test('prefers a synced hit over a closer plain-only hit', async () => {
    const h = http({
      '/api/search': {
        status: 200,
        body: [synced(1, 204, { syncedLyrics: null }), synced(2, 206)],
      },
    });
    expect((await lookup(h, key))?.source).toBe('lrclib:2');
  });

  test('returns plain-only lyrics when nothing synced fits', async () => {
    const h = http({ '/api/search': { status: 200, body: [synced(1, 204, { syncedLyrics: null })] } });
    const lyrics = await lookup(h, key);
    expect(lyrics?.synced).toBeNull();
    expect(lyrics?.plain).toBe('one\ntwo');
  });

  test('rejects hits outside the duration tolerance', async () => {
    const h = http({ '/api/search': { status: 200, body: [synced(1, 197), synced(3, 328)] } });
    expect(await lookup(h, key)).toBeNull();
  });

  test('a plain-only exact hit still looks for a synced upload (eve, dramaturgy)', async () => {
    const h = http({
      '/api/get': { status: 200, body: synced(65528, 204, { syncedLyrics: null }) },
      '/api/search': { status: 200, body: [synced(1, 4), synced(36259224, 204), synced(3, 328)] },
    });
    const lyrics = await lookup(h, key);
    expect(lyrics?.source).toBe('lrclib:36259224');
    expect(lyrics?.synced).not.toBeNull();
  });

  test('a plain-only exact hit is kept when search has nothing synced', async () => {
    const h = http({
      '/api/get': { status: 200, body: synced(65528, 204, { syncedLyrics: null }) },
      '/api/search': { status: 200, body: [] },
    });
    const lyrics = await lookup(h, key);
    expect(lyrics?.source).toBe('lrclib:65528');
    expect(lyrics?.plain).toBe('one\ntwo');
  });

  test('reaches a romanized upload through free-text search (sakanaction, 怪獣 / kaiju)', async () => {
    const calls: string[] = [];
    const h: Http = async url => {
      calls.push(url);
      const u = new URL(url);
      if (u.pathname === '/api/get') return { status: 404, text: '' };
      if (u.searchParams.get('track_name') === '怪獣') {
        return { status: 200, text: JSON.stringify([synced(1, 253, { trackName: '怪獣', artistName: 'sakanaction', syncedLyrics: null })]) };
      }
      if (u.searchParams.get('q') === 'sakanaction 怪獣') {
        return {
          status: 200,
          text: JSON.stringify([
            synced(2, 253, { trackName: '夜の踊り子', artistName: 'sakanaction', syncedLyrics: null }),
            synced(3, 252, { trackName: 'Kaiju', artistName: 'sakanaction' }),
            synced(4, 290, { trackName: '怪獣 - Kaiju', artistName: 'sakanaction' }),
          ]),
        };
      }
      return { status: 200, text: '[]' };
    };
    const lyrics = await lookup(h, { title: '怪獣', artist: 'sakanaction', durationMs: 253_000 });
    expect(lyrics?.source).toBe('lrclib:3');
    expect(lyrics?.synced).not.toBeNull();
    expect(calls.filter(c => c.includes('/api/search'))).toHaveLength(2);
  });

  test('null when everything fails', async () => {
    const h = http({ '/api/search': { status: 500, body: 'nope' } });
    expect(await lookup(h, key)).toBeNull();
  });

  test('null without a title', async () => {
    const h = http({});
    expect(await lookup(h, { ...key, title: '' })).toBeNull();
    expect(h.calls).toHaveLength(0);
  });
});
