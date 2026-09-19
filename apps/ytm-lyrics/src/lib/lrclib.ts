import type { Lyrics } from '@bridgething/client';

import { parseLrc } from './lrc';

export interface Http {
  (url: string): Promise<{ status: number; text: string }>;
}

export interface TrackKey {
  title: string;
  artist: string;
  durationMs: number | null;
}

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  duration: number | null;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental?: boolean;
}

const BASE = 'https://lrclib.net/api';
// a search hit further than this from the playing track is a different version
const DURATION_TOLERANCE_S = 3;

export function trackKeyId(key: TrackKey): string {
  return `${key.title}\u0000${key.artist}\u0000${key.durationMs ?? ''}`;
}

function toLyrics(record: LrclibRecord): Lyrics | null {
  const synced = record.syncedLyrics ? parseLrc(record.syncedLyrics) : null;
  const plain = record.plainLyrics?.trim() || null;
  if ((!synced || synced.length === 0) && !plain) return null;
  return { synced: synced && synced.length > 0 ? synced : null, plain, source: `lrclib:${record.id}` };
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function fold(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// a hit is about our track when the titles overlap, or, across scripts (怪獣 vs kaiju), when the
// artist matches; duration then separates versions
function related(r: LrclibRecord, key: TrackKey): number {
  const t = fold(r.trackName);
  const want = fold(key.title);
  if (want && (t === want || t.includes(want) || want.includes(t))) return 2;
  const a = fold(r.artistName);
  const artist = fold(key.artist);
  if (artist && (a === artist || a.includes(artist) || artist.includes(a))) return 1;
  return 0;
}

function pick(records: LrclibRecord[], key: TrackKey): LrclibRecord | null {
  const usable = records.filter(r => r.syncedLyrics || r.plainLyrics);
  let best: LrclibRecord | null = null;
  let bestScore = -Infinity;
  for (const r of usable) {
    const rel = related(r, key);
    if (rel === 0) continue;
    let gap = 0;
    if (key.durationMs !== null) {
      if (r.duration === null) continue;
      gap = Math.abs(r.duration - key.durationMs / 1000);
      if (gap > DURATION_TOLERANCE_S) continue;
    }
    // synced beats plain, a title match beats an artist match, then the closest duration
    const score = (r.syncedLyrics ? 100 : 0) + rel * 10 - gap;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

// 404 is "no exact match" and 503 is lrclib being busy; both fall through to search
async function exact(http: Http, key: TrackKey): Promise<LrclibRecord | null> {
  const q = new URLSearchParams({ track_name: key.title, artist_name: key.artist });
  if (key.durationMs !== null) q.set('duration', String(Math.round(key.durationMs / 1000)));
  const res = await http(`${BASE}/get?${q}`);
  return res.status === 200 ? parseJson<LrclibRecord>(res.text) : null;
}

async function searchWith(http: Http, params: Record<string, string>): Promise<LrclibRecord[]> {
  const res = await http(`${BASE}/search?${new URLSearchParams(params)}`);
  if (res.status !== 200) return [];
  const records = parseJson<LrclibRecord[]>(res.text);
  return Array.isArray(records) ? records : [];
}

// the field search caps at 20 rows and a popular track has more uploads than that under one title
// spelling; the free-text searches reach the same song filed under its romanized or english name
async function search(http: Http, key: TrackKey): Promise<LrclibRecord | null> {
  const seen = new Map<number, LrclibRecord>();
  const collect = (rows: LrclibRecord[]) => rows.forEach(r => seen.set(r.id, r));
  collect(await searchWith(http, { track_name: key.title, artist_name: key.artist }));
  let best = pick([...seen.values()], key);
  if (best?.syncedLyrics) return best;
  collect(await searchWith(http, { q: `${key.artist} ${key.title}`.trim() }));
  best = pick([...seen.values()], key);
  if (best?.syncedLyrics) return best;
  collect(await searchWith(http, { q: key.title }));
  return pick([...seen.values()], key);
}

export async function lookup(http: Http, key: TrackKey): Promise<Lyrics | null> {
  if (!key.title) return null;
  const hit = await exact(http, key);
  // an exact hit with only plain text is not the end: another upload of the same track is often synced
  const record = hit?.syncedLyrics ? hit : ((await search(http, key)) ?? hit);
  return record ? toLyrics(record) : null;
}
