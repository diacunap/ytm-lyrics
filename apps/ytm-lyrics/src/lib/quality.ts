// a frame-rate budget: sample rAF gaps and drop the visuals a notch when the panel cannot keep up.
// the only per-frame work is one timestamp diff; the decision runs once per window.

export type Quality = 'full' | 'lite';

const WINDOW_MS = 4000;
// below this the drift and cycling layers become a slideshow; lite mode is the better look
const LITE_BELOW_FPS = 40;
// hysteresis so a passing hiccup does not flip the stage back and forth
const FULL_ABOVE_FPS = 52;
const MIN_SAMPLES = 60;

export interface Sampler {
  push(nowMs: number): Quality | null;
  quality: Quality;
}

export function createSampler(initial: Quality = 'full'): Sampler {
  let last = -1;
  let frames = 0;
  let windowStart = -1;
  const sampler: Sampler = {
    quality: initial,
    push(now) {
      if (last < 0) {
        last = now;
        windowStart = now;
        return null;
      }
      last = now;
      frames += 1;
      if (now - windowStart < WINDOW_MS) return null;
      const fps = (frames * 1000) / (now - windowStart);
      const enough = frames >= MIN_SAMPLES;
      frames = 0;
      windowStart = now;
      if (!enough) return null;
      const next: Quality = sampler.quality === 'full' ? (fps < LITE_BELOW_FPS ? 'lite' : 'full') : fps > FULL_ABOVE_FPS ? 'full' : 'lite';
      if (next === sampler.quality) return null;
      sampler.quality = next;
      return next;
    },
  };
  return sampler;
}
