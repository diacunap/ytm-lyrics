import { memo } from 'react';

import { Backdrop } from './Backdrop';
import type { Style } from './lib/deezer';
import type { Theme } from './lib/palette';
import type { Quality } from './lib/quality';

interface Props {
  theme: Theme | null;
  artUrl: string | null;
  title: string | null;
  artist: string | null;
  // estimated from the lyric cadence; null when the song has no words to read a tempo from
  bpm: number | null;
  playing: boolean;
  songKey: string;
  quality: Quality;
  style: Style;
  energy: number;
}

// the device never hears the audio, so this is honest generative motion: the cover's colors and
// shapes drifting behind the artwork, which floats and pulses at the guessed tempo
export const Instrumental = memo(function Instrumental({ theme, artUrl, title, artist, bpm, playing, songKey, quality, style, energy }: Props) {
  const beatMs = bpm ? Math.round(60_000 / bpm) : null;
  return (
    <div
      className={'stage absolute inset-0 overflow-hidden' + (theme?.light ? ' stage-light' : '')}
      style={{ ['--play' as string]: playing ? 'running' : 'paused', ['--beat' as string]: beatMs ? `${beatMs}ms` : '0ms' }}>
      <Backdrop theme={theme} playing={playing} seed={songKey} quality={quality} beatMs={beatMs} style={style} intensity={energy} />
      <div className="grain absolute inset-0" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <div className={'art-float size-56 overflow-hidden rounded-md shadow-2xl' + (beatMs ? ' art-pulse' : '')}>
          {artUrl ? <img src={artUrl} alt="" className="size-full object-cover" /> : <div className="size-full bg-current opacity-10" />}
        </div>
        <div className="max-w-[680px] px-6 text-center">
          <div className="truncate font-karaoke text-[30px] font-bold">{title ?? ''}</div>
          <div className="truncate font-karaoke text-[18px] font-medium" style={{ color: 'var(--dim)' }}>
            {artist ?? ''}
          </div>
        </div>
      </div>
    </div>
  );
});
