import { useEffect, useRef } from 'react';

// visual feedback for fingers on the panel: a ripple where a touch lands, and while it slides, a
// trail from the origin to the finger. the trail arms (accent, thicker) once the slide is far enough
// to count as a swipe and relaxes again if the finger comes back, so a cancelled swipe looks cancelled.
// dom is driven directly from pointer events; nothing re-renders and nothing runs between touches.

const ARM_PX = 60;

export function TouchFx({ accent }: { accent: string }) {
  const layer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = layer.current;
    if (!host) return;
    let origin: { x: number; y: number } | null = null;
    let trail: HTMLDivElement | null = null;
    let head: HTMLDivElement | null = null;
    let armed = false;

    const ripple = (x: number, y: number, kind: 'down' | 'commit') => {
      const el = document.createElement('div');
      el.className = kind === 'down' ? 'fx-ripple' : 'fx-ripple fx-ripple-commit';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      host.appendChild(el);
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    const place = (x: number, y: number) => {
      if (!origin || !trail || !head) return;
      const dx = x - origin.x;
      const dy = y - origin.y;
      const len = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      trail.style.transform = `translate(${origin.x}px, ${origin.y}px) rotate(${angle}deg)`;
      trail.style.width = `${len}px`;
      head.style.transform = `translate(${x}px, ${y}px)`;
      const nowArmed = Math.abs(dx) >= ARM_PX || Math.abs(dy) >= ARM_PX;
      if (nowArmed !== armed) {
        armed = nowArmed;
        trail.classList.toggle('fx-armed', armed);
        head.classList.toggle('fx-armed', armed);
      }
    };

    const onDown = (e: PointerEvent) => {
      origin = { x: e.clientX, y: e.clientY };
      armed = false;
      ripple(e.clientX, e.clientY, 'down');
      trail = document.createElement('div');
      trail.className = 'fx-trail';
      head = document.createElement('div');
      head.className = 'fx-head';
      host.append(trail, head);
      place(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (origin) place(e.clientX, e.clientY);
    };
    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (!origin) return;
      if (armed && !cancelled) ripple(e.clientX, e.clientY, 'commit');
      const t = trail;
      const h = head;
      if (t && h) {
        t.classList.add('fx-out');
        h.classList.add('fx-out');
        setTimeout(() => {
          t.remove();
          h.remove();
        }, 260);
      }
      origin = null;
      trail = null;
      head = null;
      armed = false;
    };
    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  return <div ref={layer} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" style={{ ['--fx' as string]: accent }} />;
}
