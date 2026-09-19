import { describe, expect, test } from 'bun:test';

import { createSampler } from './quality';
import { lineKinds } from './structure';

describe('lineKinds', () => {
  test('repeated lines are chorus, short ones hooks, the rest verse', () => {
    const lines = [
      { startMs: 0, text: 'walking down the road again tonight' },
      { startMs: 1, text: 'Around the world!' },
      { startMs: 2, text: 'around the world' },
      { startMs: 3, text: 'Yeah' },
      { startMs: 4, text: 'so many things i wanted to say' },
    ];
    expect(lineKinds(lines)).toEqual(['verse', 'chorus', 'chorus', 'hook', 'verse']);
  });
  test('japanese repeats count too', () => {
    const lines = [
      { startMs: 0, text: '感情的にはなれない 今更臆病になって' },
      { startMs: 1, text: 'ドクドクドク ハイテンション' },
      { startMs: 2, text: 'ドクドクドク ハイテンション' },
    ];
    expect(lineKinds(lines)).toEqual(['verse', 'chorus', 'chorus']);
  });
});

describe('createSampler', () => {
  const run = (s: ReturnType<typeof createSampler>, fps: number, seconds: number, from = 0) => {
    let last: ReturnType<typeof s.push> = null;
    const step = 1000 / fps;
    for (let t = from; t <= from + seconds * 1000; t += step) last = s.push(t) ?? last;
    return last;
  };
  test('stays full at a healthy rate', () => {
    const s = createSampler();
    expect(run(s, 60, 9)).toBeNull();
    expect(s.quality).toBe('full');
  });
  test('drops to lite when frames come slowly', () => {
    const s = createSampler();
    expect(run(s, 25, 9)).toBe('lite');
    expect(s.quality).toBe('lite');
  });
  test('needs a clearly better rate to come back', () => {
    const s = createSampler('lite');
    expect(run(s, 45, 9)).toBeNull();
    expect(s.quality).toBe('lite');
    expect(run(s, 60, 9, 10_000)).toBe('full');
  });
});
