import type { Style } from './deezer';

// silhouettes for the stage, all drawn in a 0..100 box. each genre family draws from its own set.
export type ShapeName = keyof typeof SHAPES;

export const SHAPES = {
  circle: 'M50 2a48 48 0 1 1 0 96a48 48 0 1 1 0-96z',
  ring: 'M50 2a48 48 0 1 1 0 96a48 48 0 1 1 0-96zm0 20a28 28 0 1 0 0 56a28 28 0 1 0 0-56z',
  ellipse: 'M50 20c30 0 48 13 48 30s-18 30-48 30S2 67 2 50s18-30 48-30z',
  blob: 'M62 6c18 3 34 20 33 40c-1 21-15 40-35 46S12 84 6 62C0 40 14 14 36 8c9-3 18-4 26-2z',
  blob2: 'M40 4c22-6 50 6 55 30c5 23-10 40-28 52C50 98 22 96 10 76C-3 55 6 12 40 4z',
  heart: 'M50 92C25 72 4 55 4 33C4 18 15 8 28 8c9 0 17 5 22 13c5-8 13-13 22-13c13 0 24 10 24 25c0 22-21 39-46 59z',
  flower: 'M50 8c8 0 14 7 14 16c9-3 18 1 21 9s-1 17-9 21c8 4 12 13 9 21s-12 12-21 9c0 9-6 16-14 16s-14-7-14-16c-9 3-18-1-21-9s1-17 9-21c-8-4-12-13-9-21s12-12 21-9c0-9 6-16 14-16z',
  sparkle: 'M50 2c4 26 14 40 48 48c-34 8-44 22-48 48c-4-26-14-40-48-48c34-8 44-22 48-48z',
  triangle: 'M50 4l46 88H4z',
  lightning: 'M58 2L18 56h24l-8 42l48-60H56z',
  shard: 'M30 2l68 30l-24 66L2 60z',
  spikestar: 'M50 2l12 30l32 4l-24 22l8 32l-28-18l-28 18l8-32L6 36l32-4z',
  cross: 'M22 8l28 28l28-28l14 14l-28 28l28 28l-14 14l-28-28l-28 28L8 78l28-28L8 22z',
  diamond: 'M50 2l48 48l-48 48L2 50z',
  jagged: 'M4 60l18-30l14 18l12-40l12 34l14-22l10 40l14-16v54H4z',
  square: 'M8 8h84v84H8z',
  hexagon: 'M50 2l42 24v48L50 98L8 74V26z',
  chevron: 'M4 30l46-26l46 26v22L50 26L4 52zm0 44l46-26l46 26v22L50 70L4 96z',
  bars: 'M6 60h14v34H6zm22-26h14v60H28zm22-30h14v90H50zm22 44h14v46H72z',
  plus: 'M38 4h24v34h34v24H62v34H38V62H4V38h34z',
  pixels: 'M4 4h28v28H4zm36 0h28v28H40zm-36 36h28v28H4zm72 0h28v28H76zM40 76h28v28H40zm36-36h28v28H76z',
  wave: 'M2 50c12-24 24-24 36 0s24 24 36 0s16-16 24-8v20c-8-8-14 0-24 8s-24 24-36 0S14 46 2 70z',
  leaf: 'M96 4C60 4 16 24 8 66c-2 10 0 22 2 30c6-30 26-52 54-64c-22 18-38 40-46 64c40 6 78-20 78-92z',
  note: 'M62 6v58a16 14 0 1 1-10-13V24l-24 6v46a16 14 0 1 1-10-13V16z',
  crescent: 'M62 4a46 46 0 1 0 0 92a36 36 0 1 1 0-92z',
} as const;

export const PACK_SHAPES: Record<Style, ShapeName[]> = {
  round: ['blob', 'blob2', 'circle', 'heart', 'flower', 'sparkle', 'ring'],
  sharp: ['lightning', 'shard', 'spikestar', 'cross', 'diamond', 'jagged', 'triangle'],
  grid: ['hexagon', 'chevron', 'bars', 'plus', 'pixels', 'square', 'ring'],
  calm: ['wave', 'leaf', 'note', 'crescent', 'ellipse', 'ring', 'circle'],
};
