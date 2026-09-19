import { memo } from 'react';

// the card that announces a new track: cover at full height sliding in from the right and braking at
// the left edge, name and title riding alongside, a two-second hold, then everything leaves left.
// keyed by the song so it plays exactly once per change; the parent unmounts it on animationend.
export const TrackIntro = memo(function TrackIntro({
  artUrl,
  title,
  artist,
  light,
  onDone,
}: {
  artUrl: string | null;
  title: string | null;
  artist: string | null;
  light: boolean;
  onDone: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className={'intro-scrim absolute inset-0 ' + (light ? 'bg-off-white' : 'bg-screen')} />
      <div className="intro-art absolute top-0 left-0 h-full aspect-square overflow-hidden shadow-2xl" onAnimationEnd={onDone}>
        {artUrl ? <img src={artUrl} alt="" className="size-full object-cover" /> : <div className="size-full bg-current opacity-10" />}
      </div>
      <div className="intro-text absolute top-1/2 right-8 left-[508px] -translate-y-1/2">
        <div className="font-karaoke text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance line-clamp-4">{title ?? ''}</div>
        <div className="mt-3 font-karaoke text-[21px] font-semibold" style={{ color: 'var(--dim)' }}>
          {artist ?? ''}
        </div>
      </div>
    </div>
  );
});
