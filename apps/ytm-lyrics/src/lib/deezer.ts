import type { Http } from './lrclib';

// deezer's public api needs no key and carries a bpm for a good share of its catalog. it is
// consulted off the render path, once per track, and the answer (or its absence) is cached.

const BASE = 'https://api.deezer.com';
const DURATION_TOLERANCE_S = 4;

export interface TrackFacts {
  bpm: number | null;
  // replaygain-style loudness in dB; null when unknown
  gainDb: number | null;
  source: string;
}

interface SearchHit {
  id: number;
  title: string;
  duration: number;
  artist?: { name?: string };
}

function parse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function clean(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// the hit whose length matches the playing track; among those, the one whose title matches best
export function pickHit(hits: SearchHit[], title: string, durationMs: number | null): SearchHit | null {
  const want = clean(title);
  let best: { hit: SearchHit; score: number } | null = null;
  for (const hit of hits) {
    if (durationMs !== null && Math.abs(hit.duration - durationMs / 1000) > DURATION_TOLERANCE_S) continue;
    const got = clean(hit.title);
    // exact title first, then a title that starts with ours (version suffixes), then anything in range
    const score = got === want ? 3 : got.startsWith(want) ? 2 : 1;
    if (!best || score > best.score) best = { hit, score };
  }
  return best?.hit ?? null;
}

export async function lookupFacts(http: Http, key: { title: string; artist: string; durationMs: number | null }): Promise<TrackFacts | null> {
  if (!key.title) return null;
  const q = new URLSearchParams({ q: `${key.artist} ${key.title}`.trim(), limit: '8' });
  const res = await http(`${BASE}/search?${q}`);
  if (res.status !== 200) return null;
  const hits = parse<{ data?: SearchHit[] }>(res.text)?.data ?? [];
  const hit = pickHit(hits, key.title, key.durationMs);
  if (!hit) return null;
  const detail = await http(`${BASE}/track/${hit.id}`);
  if (detail.status !== 200) return null;
  const track = parse<{ bpm?: number; gain?: number }>(detail.text);
  if (!track) return null;
  // deezer reports 0 when it has not analysed the track
  const bpm = typeof track.bpm === 'number' && track.bpm > 0 ? Math.round(track.bpm * 10) / 10 : null;
  const gainDb = typeof track.gain === 'number' ? track.gain : null;
  return { bpm, gainDb, source: `deezer:${hit.id}` };
}
