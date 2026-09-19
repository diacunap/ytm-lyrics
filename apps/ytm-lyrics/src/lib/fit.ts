// finds the largest font size at which a line fits the stage, ahead of time and off the frame that
// shows it. measuring means laying out, so it runs in idle time on a hidden clone, by binary search,
// and the answer is remembered per text so a line change only reads a number.

export const MAX_PX = 128;
export const MIN_PX = 40;

type Idle = (cb: () => void) => void;
const idle: Idle = cb => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(cb, { timeout: 400 });
  else setTimeout(cb, 0);
};

export class FitMeasurer {
  private cache = new Map<string, number>();
  private queue: string[] = [];
  private scheduled = false;
  private probe: HTMLDivElement | null = null;

  constructor(
    private className: string,
    private stageW: number,
    private stageH: number,
    // renders the words exactly as the stage will, so the measurement matches
    private render: (text: string) => string,
  ) {}

  private font = '';

  // the probe lives outside the stage, so it is told which voice to measure with; a change clears the cache
  setFont(font: string): void {
    if (font === this.font) return;
    this.font = font;
    this.cache.clear();
    this.queue = [];
    if (this.probe) this.probe.style.cssText += font;
  }

  get(text: string): number | undefined {
    return this.cache.get(text);
  }

  // measure now, on the frame; only for the line on screen when nothing was prepared
  measureNow(text: string): number {
    const hit = this.cache.get(text);
    if (hit !== undefined) return hit;
    const px = this.measure(text);
    this.cache.set(text, px);
    return px;
  }

  // queue lines to measure in idle time, nearest first
  prepare(texts: string[]): void {
    for (const t of texts) if (t && !this.cache.has(t) && !this.queue.includes(t)) this.queue.push(t);
    if (this.scheduled || this.queue.length === 0) return;
    this.scheduled = true;
    idle(() => {
      this.scheduled = false;
      const t = this.queue.shift();
      if (t !== undefined && !this.cache.has(t)) this.cache.set(t, this.measure(t));
      if (this.queue.length > 0) this.prepare([]);
    });
  }

  dispose(): void {
    this.probe?.remove();
    this.probe = null;
    this.queue = [];
  }

  private element(): HTMLDivElement {
    if (this.probe) return this.probe;
    const el = document.createElement('div');
    el.className = this.className;
    el.style.cssText = `position:absolute;left:-10000px;top:0;width:${this.stageW}px;visibility:hidden;pointer-events:none;contain:layout style;${this.font}`;
    document.body.appendChild(el);
    this.probe = el;
    return el;
  }

  private fits(el: HTMLDivElement, px: number): boolean {
    el.style.fontSize = `${px}px`;
    return el.scrollHeight <= this.stageH && el.scrollWidth <= this.stageW;
  }

  private measure(text: string): number {
    const el = this.element();
    el.innerHTML = this.render(text);
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
