import type { LyricLine } from '@bridgething/client';

export interface WordSpan {
  text: string;
  startMs: number;
  endMs: number;
  // true when the source had a space after this word
  trailingSpace: boolean;
}

// a line with no follower, or one before a long instrumental gap, is sung over at most this long
const MAX_LINE_MS = 8000;
const MIN_LINE_MS = 800;

type Segmenter = { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

function segmenter(): Segmenter | null {
  const ctor = (globalThis as { Intl?: { Segmenter?: new (locale: string, opts: object) => Segmenter } }).Intl?.Segmenter;
  return ctor ? new ctor('ja', { granularity: 'word' }) : null;
}

const cache: { seg: Segmenter | null | undefined } = { seg: undefined };

// splits on spaces where they exist; scripts without spaces fall back to the platform word segmenter
export function splitWords(text: string): Array<{ text: string; trailingSpace: boolean }> {
  const out: Array<{ text: string; trailingSpace: boolean }> = [];
  if (/\s/.test(text.trim())) {
    for (const part of text.trim().split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (out.length) out[out.length - 1].trailingSpace = true;
      } else {
        out.push({ text: part, trailingSpace: false });
      }
    }
    return out;
  }
  if (cache.seg === undefined) cache.seg = segmenter();
  if (cache.seg) {
    for (const s of cache.seg.segment(text.trim())) {
      if (s.segment.trim()) out.push({ text: s.segment, trailingSpace: false });
    }
    if (out.length) return out;
  }
  return text.trim() ? [{ text: text.trim(), trailingSpace: false }] : [];
}

export function lineWindow(lines: readonly LyricLine[], index: number): { startMs: number; endMs: number } {
  const line = lines[index] as LyricLine & { endMs?: number };
  const startMs = line.startMs;
  // an instrumental marker in the source pins the end; otherwise the next lyric does
  const next = line.endMs ?? lines[index + 1]?.startMs ?? startMs + MAX_LINE_MS;
  const endMs = Math.min(next, startMs + MAX_LINE_MS);
  return { startMs, endMs: Math.max(endMs, startMs + MIN_LINE_MS) };
}

export interface TimedWord {
  text: string;
  trailingSpace: boolean;
  beats: number;
}

export interface Timing {
  beats: (word: string) => number;
  // how long one beat lasts in this song; null means "spread across the whole window"
  msPerBeat: number | null;
  // optional tokenizer that also decides what each word displays as (romaji instead of kanji)
  words?: (text: string) => TimedWord[];
}

const charBeats = (word: string) => Math.max(1, [...word].length);
const DEFAULT_TIMING: Timing = { beats: charBeats, msPerBeat: null };
// singers stretch; a line may run this much longer than its beats say before we call the rest silence
const STRETCH = 1.1;
// the tail of every window is the breath before the next line: never sing into it
const BREATH = 0.12;

// no per-word timing exists in lrc: weight each word by its beats (morae / syllables), and when the
// song's tempo is known, only the sung part of the window gets words; the rest is the singer breathing
export function wordSpans(lines: readonly LyricLine[], index: number, timing: Timing = DEFAULT_TIMING): WordSpan[] {
  if (index < 0 || index >= lines.length) return [];
  const words: TimedWord[] = timing.words
    ? timing.words(lines[index].text)
    : splitWords(lines[index].text).map(w => ({ ...w, beats: timing.beats(w.text) }));
  if (words.length === 0) return [];
  const { startMs, endMs } = lineWindow(lines, index);
  const weights = words.map(w => Math.max(1, w.beats));
  const total = weights.reduce((a, b) => a + b, 0);
  const window = endMs - startMs;
  const cap = Math.max(MIN_LINE_MS, window * (1 - BREATH));
  const sung = timing.msPerBeat === null ? cap : Math.min(cap, Math.max(MIN_LINE_MS, total * timing.msPerBeat * STRETCH));
  const sungEnd = startMs + sung;
  let cursor = startMs;
  return words.map((w, i) => {
    const start = cursor;
    cursor = i === words.length - 1 ? sungEnd : start + (sung * weights[i]) / total;
    return { text: w.text, startMs: Math.round(start), endMs: Math.round(cursor), trailingSpace: w.trailingSpace };
  });
}

// 0..1 progress through a word at posMs
export function wordFill(word: WordSpan, posMs: number): number {
  if (posMs <= word.startMs) return 0;
  if (posMs >= word.endMs) return 1;
  return (posMs - word.startMs) / (word.endMs - word.startMs);
}

const HYPHENATE_OVER = 12;
const MIN_CHUNK = 5;
const SOFT_HYPHEN = '\u00ad';

// a long word gets soft hyphens at syllable-ish boundaries so the browser can break it with a dash
// instead of pushing it off the stage. romaji breaks after a vowel (that is a mora); other latin
// words break between a vowel and the consonant that follows it. cjk never needs this.
export function hyphenate(word: string): string {
  if ([...word].length <= HYPHENATE_OVER || !/^[\p{Script=Latin}'’]+$/u.test(word)) return word;
  const chars = [...word];
  const vowel = (c: string) => /[aeiouyáéíóúüāēīōū]/i.test(c);
  let out = '';
  let chunk = 0;
  for (let i = 0; i < chars.length; i++) {
    out += chars[i];
    chunk += 1;
    const next = chars[i + 1];
    const remaining = chars.length - i - 1;
    const boundary = next !== undefined && vowel(chars[i]) && !vowel(next);
    if (boundary && chunk >= MIN_CHUNK && remaining >= MIN_CHUNK) {
      out += SOFT_HYPHEN;
      chunk = 0;
    }
  }
  return out;
}
