import type { LyricLine } from '@bridgething/client';

// [mm:ss.xx] or [mm:ss.xxx]; a line may carry several stamps for repeated choruses.
const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function fractionMs(raw: string | undefined): number {
  if (!raw) return 0;
  // two digits are centiseconds, three are milliseconds
  return raw.length === 3 ? Number(raw) : Number(raw.padEnd(2, '0')) * 10;
}

// a line that is only music marks or dots is an instrumental marker, not something to sing
const MARKER_ONLY = /^[\s♪♫♬♩🎵🎶・\.…\-—~～()\[\]]*$/;

export interface TimedLine extends LyricLine {
  // set when an instrumental marker followed this line: the vocals stop here, not at the next lyric
  endMs?: number;
}

export function parseLrc(text: string): TimedLine[] {
  const lines: TimedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    STAMP.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    let lastEnd = 0;
    while ((match = STAMP.exec(rawLine)) !== null) {
      if (match.index !== lastEnd) break;
      stamps.push(Number(match[1]) * 60_000 + Number(match[2]) * 1000 + fractionMs(match[3]));
      lastEnd = STAMP.lastIndex;
    }
    if (stamps.length === 0) continue;
    const lyric = rawLine.slice(lastEnd).trim();
    for (const startMs of stamps) lines.push({ startMs, text: lyric });
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  // fold markers into the preceding line's end and drop them
  const kept: TimedLine[] = [];
  for (const line of lines) {
    if (MARKER_ONLY.test(line.text)) {
      const prev = kept[kept.length - 1];
      if (prev && prev.endMs === undefined) prev.endMs = line.startMs;
      continue;
    }
    kept.push(line);
  }
  return kept;
}
