import type { LyricLine } from '@bridgething/client';

// what a line is, read off the lyrics alone: a chorus repeats, a hook is short and loud
export type LineKind = 'verse' | 'chorus' | 'hook';

const CHORUS_MIN_REPEATS = 2;
const HOOK_MAX_WORDS = 3;
// cjk lines carry few spaces, so a hook must also be short in characters
const HOOK_MAX_CHARS = 14;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// a line is part of the chorus when its text shows up again elsewhere in the song
export function lineKinds(lines: readonly LyricLine[]): LineKind[] {
  const counts = new Map<string, number>();
  const keys = lines.map(l => normalize(l.text));
  for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  return keys.map((k, i) => {
    const words = lines[i].text.trim().split(/\s+/).filter(Boolean).length;
    if (k && (counts.get(k) ?? 0) >= CHORUS_MIN_REPEATS) return 'chorus';
    if (words > 0 && words <= HOOK_MAX_WORDS && [...lines[i].text.trim()].length <= HOOK_MAX_CHARS) return 'hook';
    return 'verse';
  });
}
