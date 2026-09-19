import { memo, useMemo } from 'react';

import type { Style } from './lib/deezer';
import { gradientCss, rgbCss, themeKey, type Theme } from './lib/palette';
import { PACK_SHAPES, SHAPES, type ShapeName } from './lib/shapes';

interface Props {
  theme: Theme | null;
  playing: boolean;
  // shapes are seeded per song so they land differently for every cover but never jump mid-song
  seed: string;
  // lite drops the cycling layers and most shapes when the panel cannot hold the frame rate
  quality?: 'full' | 'lite';
  // 1 for a verse; a chorus pushes it up so the stage answers the song
  intensity?: number;
  // the shapes breathe at this period; null keeps them still
  beatMs?: number | null;
  // the genre's look: which shapes, how many, how fast
  style?: Style;
}

const FALLBACK: Theme = {
  colors: [
    [60, 80, 200],
    [200, 60, 120],
    [40, 160, 140],
    [220, 140, 40],
    [120, 60, 200],
  ],
  light: false,
};

// how long one full pass through the five gradient layers takes
export const CYCLE_S = 60;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// small deterministic prng so the layout is a function of the seed
function rng(seed: number): () => number {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10_000) / 10_000;
  };
}

// what each genre family puts on the stage: which silhouettes, how many, how fast, how big
const PACKS: Record<Style, { count: number; speed: number; sizeMin: number; sizeMax: number; alpha: number }> = {
  round: { count: 7, speed: 1, sizeMin: 60, sizeMax: 180, alpha: 1 },
  sharp: { count: 8, speed: 0.6, sizeMin: 70, sizeMax: 220, alpha: 1.15 },
  grid: { count: 10, speed: 0.8, sizeMin: 36, sizeMax: 90, alpha: 1.2 },
  calm: { count: 4, speed: 1.8, sizeMin: 140, sizeMax: 280, alpha: 0.6 },
};

interface Shape {
  kind: ShapeName;
  size: number;
  top: number;
  color: number;
  durationS: number;
  delayS: number;
  spin: number;
  reverse: boolean;
}

function layout(seed: string, style: Style): Shape[] {
  const next = rng(hash(seed));
  const pack = PACKS[style];
  const kinds = PACK_SHAPES[style];
  return Array.from({ length: pack.count }, (_, i) => ({
    kind: kinds[Math.floor(next() * kinds.length)] ?? kinds[i % kinds.length],
    size: pack.sizeMin + Math.round(next() * (pack.sizeMax - pack.sizeMin)),
    top: Math.round(next() * 88),
    color: 1 + Math.floor(next() * 4),
    durationS: 40 + Math.round(next() * 50),
    delayS: -Math.round(next() * 60),
    spin: Math.round(next() * 360),
    reverse: next() > 0.5,
  }));
}

// the stage behind lyrics and the instrumental view: the cover's colors cycling through five
// gradient layers, drifting slowly, with a few translucent shapes sliding across on the x axis.
// everything here is opacity and transform, nothing runs in javascript per frame.
export const Backdrop = memo(function Backdrop({ theme, playing, seed, quality = 'full', intensity = 1, beatMs = null, style = 'round' }: Props) {
  const t = theme ?? FALLBACK;
  const colors = t.colors;
  const pack = PACKS[style];
  const all = useMemo(() => layout(seed, style), [seed, style]);
  const shapes = quality === 'full' ? all : all.slice(0, 3);
  const layers = quality === 'full' ? colors : colors.slice(0, 1);
  const play = playing ? 'running' : 'paused';
  const layerS = CYCLE_S / colors.length;
  // a chorus or a loud song makes the shapes move faster and show more of their color
  const speed = pack.speed / intensity;
  const alpha = (t.light ? 0.22 : 0.16) * intensity * pack.alpha;
  return (
    <div
      key={themeKey(t)}
      className={'absolute inset-0 overflow-hidden ' + (t.light ? 'bg-off-white' : 'bg-screen')}
      style={{ ['--play' as string]: play }}>
      <div className={'absolute inset-0' + (quality === 'full' ? ' karaoke-bg' : '')}>
        {layers.map((c, i) => (
          <div
            key={i}
            className="bg-layer absolute inset-0"
            style={{
              backgroundImage: gradientCss(c, colors[(i + 2) % colors.length]),
              ['--cycle' as string]: `${CYCLE_S}s`,
              ['--slot' as string]: `${-i * layerS}s`,
            }}
          />
        ))}
      </div>
      <div
        className={'absolute inset-0' + (beatMs && quality === 'full' ? ' shapes-beat' : '')}
        style={{ ['--beat' as string]: beatMs ? `${beatMs}ms` : '0ms' }}>
        {shapes.map((s, i) => (
          <svg
            key={i}
            className={`shape${s.reverse ? ' shape-reverse' : ''}`}
            viewBox="0 0 100 100"
            aria-hidden
            style={{
              width: s.size,
              height: s.size,
              top: `${s.top}%`,
              ['--dur' as string]: `${Math.round(s.durationS * speed)}s`,
              ['--delay' as string]: `${s.delayS}s`,
              ['--spin' as string]: `${s.spin}deg`,
            }}>
            <path d={SHAPES[s.kind]} fill={rgbCss(colors[s.color % colors.length], Math.min(0.4, alpha))} />
          </svg>
        ))}
      </div>
      <div className={'absolute inset-0 ' + (t.light ? 'bg-off-white/45' : 'bg-screen/55')} />
    </div>
  );
});
