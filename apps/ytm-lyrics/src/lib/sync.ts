import type { LyricLine } from '@bridgething/client';

export interface Playhead {
  positionMs: number;
  // ms the daemon's position was already stale when it left the daemon
  positionAgeMs: number | null;
  playing: boolean;
  // performance.now() when the snapshot arrived
  receivedAt: number;
}

export function projectPosition(head: Playhead, now: number, offsetMs = 0): number {
  const drift = head.playing ? now - head.receivedAt + (head.positionAgeMs ?? 0) : 0;
  return Math.max(0, head.positionMs + drift + offsetMs);
}

// index of the last line that started at or before posMs; -1 before the first line
export function lineIndexAt(lines: readonly LyricLine[], posMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= posMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
