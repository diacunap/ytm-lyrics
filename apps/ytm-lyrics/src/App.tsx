import { BridgethingClient, type LyricLine } from '@bridgething/client';
import { useEffect, useMemo, useRef, useState } from 'react';

import { daemonUrl } from './daemon';
import { useArtwork, useFacts, useJaDict, useLyrics, useOffset, usePlayer, useTheme } from './hooks';
import { Instrumental } from './Instrumental';
import { Karaoke } from './Karaoke';
import { TouchFx } from './TouchFx';
import { Ambient } from './Ambient';
import { TrackIntro } from './TrackIntro';
import { TapFolder, classify, side } from './lib/gestures';
import { lineIndexAt, projectPosition, type Playhead } from './lib/sync';
import { accentCss, type Theme } from './lib/palette';
import { createSampler, type Quality } from './lib/quality';
import { beatsFor, estimateBpm, msPerBeat } from './lib/tempo';
import { lineWindow } from './lib/words';

const SCREEN_W = 800;
const SCREEN_H = 480;
const RING_PX = 4;
// two lines of 34px display text plus breathing room
const LINE_HEIGHT_PX = 92;
const SEEK_STEP_MS = 5000;
const TOAST_MS = 1000;
// seeks land late through mediaremote; fold a burst of taps into one command
const SEEK_SETTLE_MS = 250;
// a new line shows a beat before its stamp; the eye reads ahead of the ear
const LINE_LEAD_MS = 120;
// how often the line index is checked, and how often the ring and clock repaint
const TICK_MS = 50;
const RING_TICK_MS = 200;
// a new song must stay reported this long before the intro plays
const INTRO_SETTLE_MS = 500;
const OFFSET_STEP_MS = 100;
const OFFSET_LIMIT_MS = 5000;

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const { conn, state, head: snapshotHead } = usePlayer(client);
  // a pending seek moves the local playhead at once; the next daemon snapshot takes over again
  const [seekHead, setSeekHead] = useState<{ head: Playhead; basedOn: Playhead | null } | null>(null);
  const head = seekHead && seekHead.basedOn === snapshotHead ? seekHead.head : snapshotHead;
  const track = state?.track ?? null;
  const artUrl = useArtwork(client, track?.artworkId ?? null);
  const facts = useFacts(client, state);
  const { status, lyrics } = useLyrics(client, state, facts);
  const [offset, setOffset] = useOffset(client);
  const playing = head?.playing ?? false;
  const lines = lyrics?.synced ?? null;
  const durationMs = track?.durationMs ?? 0;

  const [lineIndex, setLineIndex] = useState(-1);
  const [positionMs, setPositionMs] = useState(0);
  const [volume, setVolume] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [karaoke, setKaraoke] = useState(false);
  const instrumental = track !== null && status === 'none';
  const liveTheme = useTheme(karaoke || instrumental ? artUrl : null);
  // the last cover's theme stays on for the ambient clock once the music stops
  const lastTheme = useRef<Theme | null>(null);
  if (liveTheme) lastTheme.current = liveTheme;
  const theme = liveTheme ?? (track ? null : lastTheme.current);
  const [quality, setQuality] = useState<Quality>('full');
  // identity of the song by name only: a seek can report a partial item (odd duration, new ids) for a moment
  const songKey = track ? `${track.title ?? ''}|${track.artist ?? ''}` : '';
  // every track change plays the intro; the key has to hold for a moment so a seek's flicker does not
  const [intro, setIntro] = useState<string | null>(null);
  const seenSong = useRef<string | null>(null);
  useEffect(() => {
    if (!songKey || songKey === seenSong.current) return;
    const timer = setTimeout(() => {
      seenSong.current = songKey;
      setIntro(songKey);
    }, INTRO_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [songKey]);
  const dict = useJaDict(lyrics);
  // a measured tempo (deezer's, or ours from the preview) wins; the lyric cadence is the offline fallback
  const estimatedBpm = useMemo(() => (lines ? estimateBpm(msPerBeat(lines, beatsFor(dict))) : null), [lines, dict]);
  const bpm = facts?.bpm ?? estimatedBpm;
  const style = facts?.style ?? 'round';
  // loudness as a multiplier on the stage: the preview's energy first, deezer's gain as a proxy, else neutral
  const energy = useMemo(() => {
    if (facts?.energy !== null && facts?.energy !== undefined) return 0.7 + facts.energy * 0.7;
    if (facts?.gainDb !== null && facts?.gainDb !== undefined) return Math.max(0.7, Math.min(1.4, 1.4 + (facts.gainDb + 4) * 0.07));
    return 1;
  }, [facts]);

  // the loop and the input handlers read the latest values without re-subscribing every render
  const latest = useRef({ head, snapshotHead, offset, lines, playing, volume, durationMs, karaoke });
  latest.current = { head, snapshotHead, offset, lines, playing, volume, durationMs, karaoke };

  useEffect(() => client.audio.onVolumeChanged(msg => setVolume(msg.level)), [client]);

  useEffect(() => {
    // the fill itself is css on the compositor; this loop only moves the line index and, less often,
    // the ring and clock. twenty ticks a second is plenty for both and keeps the main thread quiet.
    let lastShown = -1;
    const sampler = createSampler();
    let frame = 0;
    const sample = (now: number) => {
      const changed = sampler.push(now);
      if (changed) {
        setQuality(changed);
        setToast({ text: changed === 'lite' ? 'Lite visuals' : 'Full visuals', at: performance.now() });
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    const tick = () => {
      const { head, offset, lines } = latest.current;
      if (!head) return;
      const pos = projectPosition(head, performance.now(), offset);
      if (lines) setLineIndex(lineIndexAt(lines, pos + LINE_LEAD_MS));
      const slot = Math.floor(pos / RING_TICK_MS);
      if (slot !== lastShown) {
        lastShown = slot;
        setPositionMs(pos);
      }
    };
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const show = (text: string) => setToast({ text, at: performance.now() });
    const togglePlay = () => (latest.current.playing ? client.player.pause() : client.player.resume());
    const toggleKaraoke = () => {
      const next = !latest.current.karaoke;
      setKaraoke(next);
      show(next ? 'Super Karaoke' : 'Lyrics');
    };

    let seekTimer: ReturnType<typeof setTimeout> | null = null;
    const seekBy = (deltaMs: number) => {
      const { head, snapshotHead, offset, durationMs } = latest.current;
      if (!head || durationMs <= 0) return;
      const pos = projectPosition(head, performance.now(), 0);
      const target = Math.max(0, Math.min(durationMs, pos + deltaMs));
      setSeekHead({
        head: { ...head, positionMs: target, positionAgeMs: 0, receivedAt: performance.now() },
        basedOn: snapshotHead,
      });
      show(`${deltaMs < 0 ? '−' : '+'}${Math.abs(deltaMs) / 1000}s · ${clock(target + offset)}`);
      if (seekTimer) clearTimeout(seekTimer);
      seekTimer = setTimeout(() => client.player.seekTo({ positionMs: Math.round(target) }), SEEK_SETTLE_MS);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === '1' || e.key === 'Enter') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === '2' || e.key === '3') {
        // presets 2 and 3 nudge the lyric clock: 2 when the words run early, 3 when they run late
        const step = e.key === '2' ? -OFFSET_STEP_MS : OFFSET_STEP_MS;
        const next = Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, latest.current.offset + step));
        setOffset(next);
        show(`Sync ${next > 0 ? '+' : ''}${next} ms`);
      } else if (e.key === 'Escape') {
        // the button under the wheel; nothing in this app has a "back", so it flips super karaoke
        e.preventDefault();
        toggleKaraoke();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0) return;
      // step commands ride the transport (hid bits included); setVolume is a broadcast that reaches no one here
      const dir = Math.sign(e.deltaX);
      dir > 0 ? client.audio.volumeUp() : client.audio.volumeDown();
      const { volume } = latest.current;
      show(volume === null ? `Volume ${dir > 0 ? '+' : '−'}` : `Volume ${Math.round(volume * 100)}%`);
    };

    const taps = new TapFolder(
      () => togglePlay(),
      x => seekBy(side(x) === 'left' ? -SEEK_STEP_MS : SEEK_STEP_MS),
    );
    let down: { x: number; y: number; at: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const now = performance.now();
      const gesture = classify({ x0: down.x, y0: down.y, x1: e.clientX, y1: e.clientY, dt: now - down.at });
      down = null;
      if (gesture === 'tap') taps.tap(e.clientX, now);
      else if (gesture === 'swipe-left') client.player.skipNext();
      else if (gesture === 'swipe-right') client.player.skipPrev({ allowSeeking: true });
      else if (gesture === 'swipe-up' && !latest.current.karaoke) toggleKaraoke();
      else if (gesture === 'swipe-down' && latest.current.karaoke) toggleKaraoke();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      taps.dispose();
      if (seekTimer) clearTimeout(seekTimer);
    };
  }, [client, setOffset]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  // how far through the current line we are, for the ring's inner sweep
  const lineProgress = useMemo(() => {
    if (!lines || lineIndex < 0) return 0;
    const { startMs, endMs } = lineWindow(lines, lineIndex);
    return Math.max(0, Math.min(1, (positionMs - startMs) / (endMs - startMs)));
  }, [lines, lineIndex, positionMs]);
  // the ring must read on any stage: the accent already leans toward the ink side of the theme
  const ringColor = (karaoke || instrumental) && theme ? accentCss(theme) : '#3b9cff';
  // ms until the next line starts, for the karaoke countdown; null when nothing is coming
  const nextIn = useMemo(() => {
    if (!lines) return null;
    const next = lines[lineIndex + 1];
    return next ? Math.max(0, next.startMs - positionMs) : null;
  }, [lines, lineIndex, positionMs]);

  const progressRing = (
    <ProgressRing progress={progress} lineProgress={karaoke ? lineProgress : null} color={ringColor} paused={!playing && track !== null} light={!!theme?.light} />
  );

  const instrumentalView = (
    <Instrumental theme={theme} artUrl={artUrl} title={track?.title ?? null} artist={track?.artist ?? null} bpm={bpm} playing={playing} songKey={songKey} quality={quality} style={style} energy={energy} />
  );

  const classic = (
    <>
      <header className="flex shrink-0 items-center gap-5 px-8 pt-6 pb-3">
        <div className="size-16 shrink-0 overflow-hidden bg-bg">
          {artUrl ? <img src={artUrl} alt="" className="size-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          {track ? (
            <>
              <div className="truncate font-display text-title font-medium leading-tight">{track.title ?? '—'}</div>
              <div className="truncate text-row text-soft">{track.artist ?? ''}</div>
            </>
          ) : (
            <div className="text-row text-soft">{conn === 'open' ? 'nothing playing' : conn}</div>
          )}
        </div>
        <div className="shrink-0 text-right font-mono text-hint text-dim tabular-nums">
          <div>
            {clock(positionMs)} <span className="opacity-50">/ {clock(durationMs)}</span>
          </div>
          <div className="text-eyebrow tracking-[0.2em] uppercase opacity-70">
            {playing ? 'playing' : track ? 'paused' : ''}
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {lines ? (
          <LyricsScroller lines={lines} current={lineIndex} />
        ) : instrumental ? (
          instrumentalView
        ) : (
          <Fallback status={status} plain={lyrics?.plain ?? null} hasTrack={track !== null} />
        )}
      </main>
    </>
  );

  const superKaraoke = (
    <>
      {lines ? (
        head ? (
          <Karaoke lines={lines} current={lineIndex} head={head} offsetMs={offset} theme={theme} dict={dict} songKey={songKey} quality={quality} bpm={bpm} style={style} energy={energy} />
        ) : null
      ) : instrumental ? (
        instrumentalView
      ) : (
        <Fallback status={status} plain={lyrics?.plain ?? null} hasTrack={track !== null} />
      )}
      {lines && nextIn !== null && nextIn > 0 ? (
        <div
          className="pointer-events-none absolute bottom-6 left-10 z-10 font-mono text-hint tabular-nums"
          style={{ color: theme?.light ? 'rgba(10,12,14,0.5)' : 'rgba(255,255,255,0.5)' }}>
          next {Math.floor(nextIn / 1000)}.{String(Math.floor((nextIn % 1000) / 100))}s
        </div>
      ) : null}
      <div
        className="pointer-events-none absolute top-5 right-8 left-8 z-10 flex items-baseline justify-between font-mono text-hint"
        style={{ color: theme?.light ? 'rgba(10,12,14,0.6)' : 'rgba(255,255,255,0.6)' }}>
        <span className="truncate">
          {track?.title ?? ''}
          {track?.artist ? <span className="opacity-60"> · {track.artist}</span> : null}
        </span>
        <span className="tabular-nums">
          {bpm ? (
            <span className="mr-4 opacity-80">
              {facts?.bpm ? '♩ ' : '~'}
              {Math.round(bpm)}
              {facts?.bpmSource === 'preview' ? '*' : ''}
            </span>
          ) : null}
          {clock(positionMs)}
        </span>
      </div>
    </>
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-screen text-off-white">
      {track === null && conn === 'open' ? <Ambient theme={theme} quality={quality} /> : null}
      {progressRing}
      {track === null && conn === 'open' ? null : karaoke ? superKaraoke : classic}
      {intro ? (
        <TrackIntro key={intro} artUrl={artUrl} title={track?.title ?? null} artist={track?.artist ?? null} year={facts?.year ?? null} light={!!theme?.light} style={style} onDone={() => setIntro(null)} />
      ) : null}
      <TouchFx accent={ringColor} />
      {toast ? (
        <div key={toast.at} className="toast pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center">
          <div className="bg-bg/90 px-6 py-3 font-mono text-row tracking-[0.2em] text-off-white uppercase">
            {toast.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// one stroke around the screen edge; the dash offset uncovers it clockwise from the top center.
// a bright head marks where it is, and in karaoke a thin inner sweep shows the current line.
function ProgressRing({
  progress,
  lineProgress,
  color,
  paused,
  light,
}: {
  progress: number;
  lineProgress: number | null;
  color: string;
  paused: boolean;
  light: boolean;
}) {
  // a base stroke in the opposite tone sits under the color so the ring never sinks into the stage
  const base = light ? 'rgba(10,12,14,0.35)' : 'rgba(255,255,255,0.28)';
  const track = light ? 'rgba(10,12,14,0.12)' : 'rgba(255,255,255,0.14)';
  const half = RING_PX / 2;
  const w = SCREEN_W - RING_PX;
  const h = SCREEN_H - RING_PX;
  const perimeter = 2 * (w + h);
  const path = `M ${SCREEN_W / 2} ${half} H ${w + half} V ${h + half} H ${half} V ${half} Z`;
  const head = pointOnRect(progress * perimeter, w, h, half);
  const innerInset = 14;
  const iw = SCREEN_W - 2 * innerInset;
  const ih = SCREEN_H - 2 * innerInset;
  const innerPerimeter = 2 * (iw + ih);
  const innerPath = `M ${SCREEN_W / 2} ${innerInset} H ${SCREEN_W - innerInset} V ${SCREEN_H - innerInset} H ${innerInset} V ${innerInset} Z`;
  return (
    <svg
      className={'pointer-events-none absolute inset-0 z-10' + (paused ? ' ring-paused' : '')}
      width={SCREEN_W}
      height={SCREEN_H}
      viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`}
      aria-hidden>
      <path d={path} fill="none" stroke={track} strokeWidth={RING_PX} />
      <path
        d={path}
        fill="none"
        stroke={base}
        strokeWidth={RING_PX + 2}
        strokeDasharray={perimeter}
        strokeDashoffset={perimeter * (1 - progress)}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={RING_PX}
        strokeDasharray={perimeter}
        strokeDashoffset={perimeter * (1 - progress)}
        style={{ transition: 'stroke 700ms ease' }}
      />
      {progress > 0 ? (
        <>
          <circle cx={head.x} cy={head.y} r={11} fill={color} opacity={0.35} />
          <circle cx={head.x} cy={head.y} r={5} fill={light ? '#0a0c0e' : '#ffffff'} />
        </>
      ) : null}
      {lineProgress !== null ? (
        <path
          d={innerPath}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.5}
          strokeWidth={1}
          strokeDasharray={innerPerimeter}
          strokeDashoffset={innerPerimeter * (1 - lineProgress)}
        />
      ) : null}
    </svg>
  );
}

// walks the rectangle clockwise from the top center by `distance` pixels
function pointOnRect(distance: number, w: number, h: number, inset: number): { x: number; y: number } {
  let d = distance;
  const topRight = w / 2;
  if (d <= topRight) return { x: w / 2 + inset + d, y: inset };
  d -= topRight;
  if (d <= h) return { x: w + inset, y: inset + d };
  d -= h;
  if (d <= w) return { x: w + inset - d, y: h + inset };
  d -= w;
  if (d <= h) return { x: inset, y: h + inset - d };
  d -= h;
  return { x: inset + d, y: inset };
}

function LyricsScroller({ lines, current }: { lines: LyricLine[]; current: number }) {
  // keep the active line at the vertical center; before the first stamp, park just above it
  const anchor = Math.max(0, current);
  return (
    <div
      className="absolute inset-0 overflow-hidden px-12"
      style={{ maskImage: 'linear-gradient(transparent, black 15%, black 85%, transparent)' }}>
      <div
        className="absolute inset-x-12 top-1/2 transition-transform duration-300 ease-out will-change-transform"
        style={{ transform: `translateY(${-anchor * LINE_HEIGHT_PX - LINE_HEIGHT_PX / 2}px)` }}>
        {lines.map((line, i) => {
          const distance = Math.abs(i - current);
          const active = i === current;
          return (
            <div
              key={i}
              className={
                'flex items-center font-display transition-[opacity,color] duration-300 ' +
                (active ? 'text-[34px] leading-[1.15] font-semibold text-off-white' : 'text-[24px] leading-[1.2] font-medium text-soft')
              }
              style={{ height: LINE_HEIGHT_PX, opacity: active ? 1 : Math.max(0.15, 0.6 - distance * 0.15) }}>
              <span className="line-clamp-2">{line.text || '♪'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Fallback({ status, plain, hasTrack }: { status: string; plain: string | null; hasTrack: boolean }) {
  if (plain) {
    return (
      <div className="h-full overflow-y-auto px-12 py-4 font-display text-[24px] leading-relaxed whitespace-pre-line text-near">
        {plain}
      </div>
    );
  }
  const label = !hasTrack ? '' : status === 'loading' ? '· · ·' : status === 'none' ? 'no lyrics for this one' : '';
  return (
    <div className="grid h-full place-items-center font-mono text-body tracking-[0.2em] text-dim uppercase">{label}</div>
  );
}
