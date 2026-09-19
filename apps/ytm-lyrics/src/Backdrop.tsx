import { memo, useMemo } from 'react';

import { gradientCss, rgbCss, themeKey, type Theme } from './lib/palette';

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
const SHAPES = 7;

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

type Kind = 'circle' | 'square' | 'triangle';

interface Shape {
  kind: Kind;
  size: number;
  top: number;
  color: number;
  durationS: number;
  delayS: number;
  spin: number;
  reverse: boolean;
}

function layout(seed: string): Shape[] {
  const next = rng(hash(seed));
  const kinds: Kind[] = ['circle', 'square', 'triangle'];
  return Array.from({ length: SHAPES }, (_, i) => ({
    kind: kinds[i % kinds.length],
    size: 40 + Math.round(next() * 120),
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
export const Backdrop = memo(function Backdrop({ theme, playing, seed, quality = 'full', intensity = 1, beatMs = null }: Props) {
  const t = theme ?? FALLBACK;
  const colors = t.colors;
  const all = useMemo(() => layout(seed), [seed]);
  const shapes = quality === 'full' ? all : all.slice(0, 3);
  const layers = quality === 'full' ? colors : colors.slice(0, 1);
  const play = playing ? 'running' : 'paused';
  const layerS = CYCLE_S / colors.length;
  // a chorus makes the shapes move faster and show more of their color
  const speed = 1 / intensity;
  const alpha = (t.light ? 0.22 : 0.16) * intensity;
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
          <div
            key={i}
            className={`shape shape-${s.kind}${s.reverse ? ' shape-reverse' : ''}`}
            style={{
              width: s.size,
              height: s.size,
              top: `${s.top}%`,
              background: rgbCss(colors[s.color % colors.length], Math.min(0.4, alpha)),
              ['--dur' as string]: `${Math.round(s.durationS * speed)}s`,
              ['--delay' as string]: `${s.delayS}s`,
              ['--spin' as string]: `${s.spin}deg`,
            }}
          />
        ))}
      </div>
      <div className={'absolute inset-0 ' + (t.light ? 'bg-off-white/45' : 'bg-screen/55')} />
    </div>
  );
});
