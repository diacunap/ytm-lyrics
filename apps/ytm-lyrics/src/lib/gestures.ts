export interface Stroke {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // ms between pointer down and up
  dt: number;
}

export type Gesture = 'tap' | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down' | null;

const SWIPE_PX = 60;
const SWIPE_MAX_MS = 700;
const TAP_PX = 12;
const TAP_MAX_MS = 350;
export const DOUBLE_TAP_MS = 350;

export function classify(s: Stroke): Gesture {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < TAP_PX && ay < TAP_PX) return s.dt <= TAP_MAX_MS ? 'tap' : null;
  if (s.dt > SWIPE_MAX_MS) return null;
  if (ax >= SWIPE_PX && ax > ay * 1.5) return dx < 0 ? 'swipe-left' : 'swipe-right';
  if (ay >= SWIPE_PX && ay > ax * 1.5) return dy < 0 ? 'swipe-up' : 'swipe-down';
  return null;
}

// which half of an 800px wide screen a tap landed on
export function side(x: number, width = 800): 'left' | 'right' {
  return x < width / 2 ? 'left' : 'right';
}

// folds taps into single or double; the single fires only once the double-tap window has closed
export class TapFolder {
  private pending: { x: number; at: number; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(
    private onSingle: (x: number) => void,
    private onDouble: (x: number) => void,
    private windowMs = DOUBLE_TAP_MS,
  ) {}

  tap(x: number, now: number): void {
    if (this.pending && now - this.pending.at <= this.windowMs) {
      clearTimeout(this.pending.timer);
      this.pending = null;
      this.onDouble(x);
      return;
    }
    if (this.pending) clearTimeout(this.pending.timer);
    const timer = setTimeout(() => {
      this.pending = null;
      this.onSingle(x);
    }, this.windowMs);
    this.pending = { x, at: now, timer };
  }

  dispose(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }
}
