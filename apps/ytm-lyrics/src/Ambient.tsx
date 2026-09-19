import { memo, useEffect, useState } from 'react';

import { Backdrop } from './Backdrop';
import type { Theme } from './lib/palette';
import type { Quality } from './lib/quality';

// what the panel shows when nothing is playing: the time, over the last cover's colors
export const Ambient = memo(function Ambient({ theme, quality }: { theme: Theme | null; quality: Quality }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // once a minute on the minute is enough for a clock without seconds
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        arm();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    arm();
    return () => clearTimeout(timer);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const raw = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const date = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <div className={'stage absolute inset-0 overflow-hidden' + (theme?.light ? ' stage-light' : '')}>
      <Backdrop theme={theme} playing seed="ambient" quality={quality} intensity={0.8} />
      <div className="clock absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-karaoke text-[168px] leading-none font-extrabold tracking-[-0.05em] tabular-nums">
          {hh}
          <span style={{ color: 'var(--faint)' }}>:</span>
          {mm}
        </div>
        <div className="mt-3 font-karaoke text-[22px] font-medium" style={{ color: 'var(--dim)' }}>
          {date}
        </div>
      </div>
    </div>
  );
});
