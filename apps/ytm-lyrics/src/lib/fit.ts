// finds the largest font size at which a line fits the stage, ahead of time and off the frame that
// shows it. measuring means laying out, so it runs in idle time on a hidden probe, by binary search,
// and the answer is remembered per voice and text so a line change only reads a number.

export const MAX_PX = 128;
export const MIN_PX = 40;

export interface FitRequest {
  text: string;
  // css declarations for the voice: font-family, weight, tracking, leading, transform
  font: string;
}

type Idle = (cb: () => void) => void;
const idle: Idle = cb => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(cb, { timeout: 400 });
  else setTimeout(cb, 0);
};

const key = (r: FitRequest) => `${r.font}\u0000${r.text}`;

export class FitMeasurer {
  private cache = new Map<string, number>();
  private queue: FitRequest[] = [];
  private scheduled = false;
  private probe: HTMLDivElement | null = null;
  private probeFont = '';

  constructor(
    private className: string,
    private stageW: number,
    private stageH: number,
    // renders the words exactly as the stage will, so the measurement matches
    private render: (text: string) => string,
  ) {}

  get(r: FitRequest): number | undefined {
    return this.cache.get(key(r));
  }

  // measure now, on the frame; only for the line on screen when nothing was prepared
  measureNow(r: FitRequest): number {
    const k = key(r);
    const hit = this.cache.get(k);
    if (hit !== undefined) return hit;
    const px = this.measure(r);
    this.cache.set(k, px);
    return px;
  }

  // queue lines to measure in idle time, nearest first
  prepare(requests: FitRequest[]): void {
    for (const r of requests) {
      if (r.text && !this.cache.has(key(r)) && !this.queue.some(q => key(q) === key(r))) this.queue.push(r);
    }
    if (this.scheduled || this.queue.length === 0) return;
    this.scheduled = true;
    idle(() => {
      this.scheduled = false;
      const r = this.queue.shift();
      if (r && !this.cache.has(key(r))) this.cache.set(key(r), this.measure(r));
      if (this.queue.length > 0) this.prepare([]);
    });
  }

  dispose(): void {
    this.probe?.remove();
    this.probe = null;
    this.queue = [];
  }

  private element(font: string): HTMLDivElement {
    if (!this.probe) {
      const el = document.createElement('div');
      el.className = this.className;
      document.body.appendChild(el);
      this.probe = el;
      this.probeFont = '';
    }
    if (font !== this.probeFont) {
      this.probe.style.cssText = `position:absolute;left:-10000px;top:0;width:${this.stageW}px;visibility:hidden;pointer-events:none;contain:layout style;${font}`;
      this.probeFont = font;
    }
    return this.probe;
  }

  private fits(el: HTMLDivElement, px: number): boolean {
    el.style.fontSize = `${px}px`;
    return el.scrollHeight <= this.stageH && el.scrollWidth <= this.stageW;
  }

  private measure(r: FitRequest): number {
    const el = this.element(r.font);
    el.innerHTML = this.render(r.text);
    if (this.fits(el, MAX_PX)) return MAX_PX;
    let lo = MIN_PX;
    let hi = MAX_PX;
    // the largest size that fits, to within 4px, in about six layouts
    while (hi - lo > 4) {
      const mid = Math.round((lo + hi) / 2);
      if (this.fits(el, mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }
}
