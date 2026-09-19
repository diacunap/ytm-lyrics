import type { Http } from './lrclib';

// deezer's public api needs no key and carries a bpm for a good share of its catalog, a 30 second
// preview for the rest, the album's genres, and the canonical spelling of a title. it is consulted
// off the render path, once per track, and the answer (or its absence) is cached.

const BASE = 'https://api.deezer.com';
const DURATION_TOLERANCE_S = 4;

export type Style = 'sharp' | 'round' | 'grid' | 'calm';

export interface TrackFacts {
  bpm: number | null;
  // where the bpm came from: deezer's own field, our analysis of the preview, or nothing yet
  bpmSource: 'deezer' | 'preview' | null;
  // replaygain-style loudness in dB; null when unknown
  gainDb: number | null;
  // 0..1 from the preview analysis; null until analysed
  energy: number | null;
  // deezer's spelling of the track, for a second lyrics search when ours found nothing
  title: string;
  artist: string;
  year: number | null;
  genres: string[];
  style: Style;
  previewUrl: string | null;
  coverUrl: string | null;
  source: string;
}

interface SearchHit {
  id: number;
  title: string;
  duration: number;
  artist?: { name?: string };
}

interface TrackDetail {
  title?: string;
  bpm?: number;
  gain?: number;
  preview?: string;
  release_date?: string;
  artist?: { name?: string };
  album?: { id?: number; cover_xl?: string; release_date?: string };
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

// a visual style per genre family: how the stage's shapes look and move
export function styleFor(genres: string[]): Style {
  const g = genres.map(x => x.toLowerCase()).join(' ');
  if (/metal|rock|punk|hardcore|grunge/.test(g)) return 'sharp';
  if (/electro|dance|techno|house|trance|hip.?hop|rap|drum|dubstep|edm/.test(g)) return 'grid';
  if (/classical|jazz|acoustic|folk|ambient|soundtrack|film|blues|lounge|chill/.test(g)) return 'calm';
  return 'round';
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
  const track = parse<TrackDetail>(detail.text);
  if (!track) return null;
  // deezer reports 0 when it has not analysed the track
  const bpm = typeof track.bpm === 'number' && track.bpm > 0 ? Math.round(track.bpm * 10) / 10 : null;
  let genres: string[] = [];
  if (track.album?.id) {
    const album = await http(`${BASE}/album/${track.album.id}`);
    if (album.status === 200) {
      genres = (parse<{ genres?: { data?: Array<{ name?: string }> } }>(album.text)?.genres?.data ?? [])
        .map(g => g.name ?? '')
        .filter(Boolean);
    }
  }
  const date = track.release_date ?? track.album?.release_date ?? '';
  const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
  return {
    bpm,
    bpmSource: bpm ? 'deezer' : null,
    gainDb: typeof track.gain === 'number' ? track.gain : null,
    energy: null,
    title: track.title ?? hit.title,
    artist: track.artist?.name ?? hit.artist?.name ?? key.artist,
    year,
    genres,
    style: styleFor(genres),
    previewUrl: track.preview || null,
    coverUrl: track.album?.cover_xl ?? null,
    source: `deezer:${hit.id}`,
  };
}
