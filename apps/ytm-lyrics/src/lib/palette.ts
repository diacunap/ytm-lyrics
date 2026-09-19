// dominant, reasonably saturated colors from an image, for backgrounds and ink behind text

export type Rgb = [number, number, number];
export type Palette = Rgb[];

export interface Theme {
  colors: Palette;
  // a mostly white or pale cover flips the stage to dark ink on a light ground
  light: boolean;
}

export const PALETTE_SIZE = 5;
const SAMPLE = 24;
// two colors closer than this (manhattan, 0-765) read as the same swatch
const DISTINCT = 90;

function saturation([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function distance(a: Rgb, b: Rgb): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

// rotate the hue a bit: turns a flat cover into a family of related tones instead of repeats
function shiftHue([r, g, b]: Rgb, degrees: number): Rgb {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const k = 1 / 3;
  const s = Math.sqrt(k);
  const m = [
    cos + (1 - cos) * k, k * (1 - cos) - s * sin, k * (1 - cos) + s * sin,
    k * (1 - cos) + s * sin, cos + k * (1 - cos), k * (1 - cos) - s * sin,
    k * (1 - cos) - s * sin, k * (1 - cos) + s * sin, cos + k * (1 - cos),
  ];
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(r * m[0] + g * m[1] + b * m[2]), clamp(r * m[3] + g * m[4] + b * m[5]), clamp(r * m[6] + g * m[7] + b * m[8])];
}

// perceived brightness 0..1 of the whole sample
export function luminance(pixels: Uint8ClampedArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    sum += (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

export const LIGHT_THRESHOLD = 0.62;

export function themeFromPixels(pixels: Uint8ClampedArray): Theme {
  const colors = pickPalette(pixels);
  const light = luminance(pixels) > LIGHT_THRESHOLD;
  return { colors, light };
}

export function pickPalette(pixels: Uint8ClampedArray, size = PALETTE_SIZE): Palette {
  // quantize to 32 levels per channel so near-identical pixels pool together
  const bins = new Map<number, { rgb: Rgb; count: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i] >> 3;
    const g = pixels[i + 1] >> 3;
    const b = pixels[i + 2] >> 3;
    const key = (r << 10) | (g << 5) | b;
    const bin = bins.get(key);
    if (bin) bin.count += 1;
    else bins.set(key, { rgb: [(r << 3) | 4, (g << 3) | 4, (b << 3) | 4], count: 1 });
  }
  // frequency times a saturation bonus keeps grey backgrounds from winning
  const ranked = [...bins.values()]
    .map(bin => ({ ...bin, score: bin.count * (0.35 + saturation(bin.rgb)) }))
    .sort((a, b) => b.score - a.score);
  const out: Palette = [];
  for (const bin of ranked) {
    if (out.every(c => distance(c, bin.rgb) > DISTINCT)) out.push(bin.rgb);
    if (out.length === size) break;
  }
  if (out.length === 0) out.push([40, 40, 60]);
  // a flat cover gives few distinct swatches: fill out with hue-shifted relatives of what we have
  let shift = 35;
  while (out.length < size) {
    out.push(shiftHue(out[0], shift));
    shift += 35;
  }
  return out;
}

export function themeFromImage(url: string): Promise<Theme | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE;
      canvas.height = SAMPLE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
      try {
        resolve(themeFromPixels(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function rgbCss(c: Rgb, alpha = 1): string {
  return alpha === 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

// one background layer: two of the palette's colors in opposite corners
export function gradientCss(a: Rgb, b: Rgb): string {
  return `radial-gradient(120% 90% at 15% 10%, ${rgbCss(a, 0.85)} 0%, transparent 60%), radial-gradient(110% 90% at 90% 95%, ${rgbCss(b, 0.8)} 0%, transparent 60%)`;
}

// the palette's lead color pushed toward the ink side: lighter on a dark stage, darker on a light one
export function accentCss(theme: Theme, index = 0): string {
  const a = theme.colors[index % theme.colors.length];
  const toward = theme.light ? 0 : 255;
  const t = theme.light ? 0.35 : 0.45;
  const move = (c: number) => Math.round(c + (toward - c) * t);
  return `rgb(${move(a[0])}, ${move(a[1])}, ${move(a[2])})`;
}

export function themeKey(t: Theme | null): string {
  return t ? `${t.light ? 'L' : 'D'}:${t.colors.flat().join(',')}` : '';
}
