import type { LyricLine } from '@bridgething/client';
import { memo, useEffect, useMemo, useRef } from 'react';

import { Backdrop } from './Backdrop';
import { FitMeasurer } from './lib/fit';
import { accentCss, type Theme } from './lib/palette';
import { HAS_JAPANESE, countMorae, romanizeLine, romanizeWords, type JaDict } from './lib/romaji';
import { projectPosition, type Playhead } from './lib/sync';
import { lineKinds } from './lib/structure';
import { beatsFor, msPerBeat } from './lib/tempo';
import { lineWindow, splitWords, wordSpans, type Timing } from './lib/words';

interface Props {
  lines: LyricLine[];
  current: number;
  head: Playhead;
  offsetMs: number;
  theme: Theme | null;
  dict: JaDict | null;
  // seeds the backdrop layout so shapes stay put for the whole song
  songKey: string;
  quality: 'full' | 'lite';
  bpm: number | null;
}

// the current line gets the whole stage: 800x480 minus the top strip and the next-line footer
const STAGE_W = 800 - 2 * 40;
const STAGE_H = 480 - 64 - 110;
const LINE_CLASS = 'font-karaoke leading-[0.98] font-extrabold tracking-[-0.03em] text-balance';
// the eye wants a word to start filling a beat before the ear hears it
const LEAD_MS = 150;
// a gap this long before the next line gets the intermission dots instead of a stale line
const INTERMISSION_MS = 6000;

export const Karaoke = memo(function Karaoke({ lines, current, head, offsetMs, theme, dict, songKey, quality, bpm }: Props) {
  // one tempo per song, from how fast the tight lines go by; words then get their share of the sung part
  const timing = useMemo<Timing>(() => {
    const beats = beatsFor(dict);
    // with the dictionary loaded, a japanese line is displayed as romaji words timed by their morae
    const words = dict
      ? (text: string) =>
          HAS_JAPANESE.test(text)
            ? romanizeWords(text, dict).map(w => ({ text: w.romaji, trailingSpace: true, beats: Math.max(1, countMorae(w.kana)) }))
            : splitWords(text).map(w => ({ ...w, beats: beats(w.text) }))
      : undefined;
    return { beats, msPerBeat: msPerBeat(lines, beats), words };
  }, [lines, dict]);
  const spans = useMemo(() => wordSpans(lines, current, timing), [lines, current, timing]);

  // the display text of a line (romaji or as written), used both to render and to pre-measure
  const shown = useMemo(() => {
    const words = timing.words ?? ((t: string) => splitWords(t).map(w => ({ ...w, beats: 1 })));
    return (t: string) => words(t).map(w => ({ text: w.text, trailingSpace: w.trailingSpace }));
  }, [timing]);
  const measurer = useRef<FitMeasurer | null>(null);
  if (!measurer.current) {
    measurer.current = new FitMeasurer(LINE_CLASS, STAGE_W, STAGE_H, t =>
      shown(t)
        .map(w => `<span class="karaoke-word${w.trailingSpace ? ' mr-[0.28em]' : ''}">${w.text.replace(/</g, '&lt;')}</span>`)
        .join(''),
    );
  }
  useEffect(() => () => measurer.current?.dispose(), []);
  // the two lines ahead get measured while nothing is happening, so their turn costs no layout
  useEffect(() => {
    const ahead = [lines[current + 1]?.text, lines[current + 2]?.text].filter((t): t is string => !!t);
    measurer.current?.prepare(ahead);
  }, [lines, current]);
  const kinds = useMemo(() => lineKinds(lines), [lines]);
  const kind = current >= 0 ? kinds[current] : 'verse';
  // the entrance follows the line: a hook slams in from the center, a chorus flashes, a verse slides
  const entrance = kind === 'hook' ? 'karaoke-in-zoom' : kind === 'chorus' ? 'karaoke-in-flash' : 'karaoke-in';
  const text = current >= 0 ? (lines[current]?.text ?? '') : '';
  const fitPx = text ? (measurer.current?.get(text) ?? measurer.current?.measureNow(text) ?? 96) : 96;
  // once the big line is romaji, the original japanese moves to the small line under it
  const romaji = useMemo(() => (dict && HAS_JAPANESE.test(text) ? text : null), [text, dict]);
  const nextRomaji = useMemo(() => {
    const t = lines[current + 1]?.text ?? '';
    return dict && HAS_JAPANESE.test(t) ? romanizeLine(t, dict).romaji : null;
  }, [lines, current, dict]);
  const next = lines[current + 1]?.text ?? '';
  const empty = current < 0 || spans.length === 0;

  // css animations are keyed off "now": every word's delay is its start minus the projected playhead.
  // this only recomputes on a snapshot, a seek, an offset nudge, or a line change, never per frame.
  const now = projectPosition(head, performance.now(), offsetMs);
  const play = head.playing ? 'running' : 'paused';
  // remounting the words restarts their animations from fresh delays; the entrance only replays per line
  const epoch = `${head.receivedAt}:${head.positionMs}:${offsetMs}`;

  const window = current >= 0 ? lineWindow(lines, current) : null;
  const nextStart = lines[current + 1]?.startMs ?? null;
  const gap = window && nextStart !== null ? nextStart - window.endMs : 0;
  const intermission = window && nextStart !== null && gap >= INTERMISSION_MS ? { from: window.endMs, to: nextStart } : null;

  return (
    <div className={'stage absolute inset-0 overflow-hidden' + (theme?.light ? ' stage-light' : '')}>
      <Backdrop
        theme={theme}
        playing={head.playing}
        seed={songKey}
        quality={quality}
        intensity={kind === 'chorus' ? 1.6 : 1}
        beatMs={bpm ? Math.round(60_000 / bpm) : null}
      />

      <div
        className="absolute top-16 right-10 bottom-19 left-10 flex items-center"
        style={{ ['--play' as string]: play, ['--accent' as string]: theme ? accentCss(theme, kind === 'chorus' ? 1 : 0) : 'var(--text)' }}>
        <div key={current} className={entrance + ' w-full'}>
          {empty ? null : (
            <div key={epoch} className={LINE_CLASS} style={{ fontSize: fitPx }}>
              {spans.map((w, i) => (
                <span
                  key={i}
                  className={'karaoke-word' + (w.trailingSpace ? ' mr-[0.28em]' : '')}
                  style={{
                    ['--word-ms' as string]: `${Math.max(1, w.endMs - w.startMs)}ms`,
                    ['--word-delay' as string]: `${Math.round(w.startMs - now - LEAD_MS)}ms`,
                  }}>
                  {w.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {intermission ? <Intermission from={intermission.from} to={intermission.to} now={now} /> : null}

      {romaji ? (
        <div
          key={`r${current}`}
          className="karaoke-next absolute right-10 bottom-16 left-10 truncate font-display text-[26px] font-medium"
          style={{ color: 'var(--dim)' }}>
          {romaji}
        </div>
      ) : null}
      <div
        key={`n${current}`}
        className="karaoke-next absolute right-10 bottom-6 left-36 truncate text-right font-karaoke text-[22px] font-medium"
        style={{ color: 'var(--faint)' }}>
        {nextRomaji ? `${nextRomaji}  ·  ${next}` : next}
      </div>
    </div>
  );
});

// three dots that light up across the gap, apple music style, so a long solo still shows time moving
function Intermission({ from, to, now }: { from: number; to: number; now: number }) {
  const third = (to - from) / 3;
  return (
    <div className="pointer-events-none absolute top-12 right-10 flex gap-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="dot block size-4 rounded-full"
          style={{
            ['--dot-ms' as string]: `${Math.round(third)}ms`,
            ['--dot-delay' as string]: `${Math.round(from + i * third - now)}ms`,
          }}
        />
      ))}
    </div>
  );
}
