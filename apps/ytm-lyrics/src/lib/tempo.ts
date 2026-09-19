import type { LyricLine } from '@bridgething/client';

import { HAS_JAPANESE, countMorae, readSegment, type JaDict } from './romaji';

// a "beat" is the unit singing is timed on: a mora in japanese, a syllable elsewhere
export type BeatsOf = (word: string) => number;

// rough english/spanish syllables: vowel groups, with a silent trailing e discounted
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  if (!w) return 1;
  let n = (w.match(/[aeiouyáéíóúü]+/g) ?? []).length;
  if (w.length > 2 && /[^aeiou]e$/.test(w) && n > 1) n -= 1;
  return Math.max(1, n);
}

export function beatsFor(dict: JaDict | null): BeatsOf {
  return word => {
    if (HAS_JAPANESE.test(word)) {
      const kana = dict ? readSegment(word, dict) : word;
      return Math.max(1, countMorae(kana) || [...word].length);
    }
    return syllables(word);
  };
}

const TIGHT_GAP_MS = 8000;
const MIN_MS_PER_BEAT = 90;
const MAX_MS_PER_BEAT = 700;
const DEFAULT_MS_PER_BEAT = 220;
const SUNG_SHARE = 0.85;

// how long one beat lasts in this song: the median over lines that run straight into the next one
export function msPerBeat(lines: readonly LyricLine[], beats: BeatsOf): number {
  const rates: number[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const window = lines[i + 1].startMs - lines[i].startMs;
    if (window <= 0 || window > TIGHT_GAP_MS) continue;
    const words = lines[i].text.trim().split(/\s+/).filter(Boolean);
    const n = words.reduce((sum, w) => sum + beats(w), 0);
    if (n === 0) continue;
    rates.push(window / n);
  }
  if (rates.length === 0) return DEFAULT_MS_PER_BEAT;
  rates.sort((a, b) => a - b);
  // the window over beats still holds the breath between lines; the sung beat is shorter than that
  const median = rates[Math.floor(rates.length / 2)] * SUNG_SHARE;
  return Math.max(MIN_MS_PER_BEAT, Math.min(MAX_MS_PER_BEAT, median));
}

// an honest bpm guess for visuals: one beat of music per ~1.5 sung beats is where pop lands
export function estimateBpm(msPerBeatValue: number): number {
  const bpm = 60_000 / (msPerBeatValue * 1.5);
  return Math.round(Math.max(60, Math.min(180, bpm)));
}
