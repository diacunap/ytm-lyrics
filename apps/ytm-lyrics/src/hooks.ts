import type { BridgethingClient, ConnectionState, Lyrics, PlayerState } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { analyze } from './lib/beat';
import { lookupFacts, type TrackFacts } from './lib/deezer';
import { lookup, trackKeyId, type TrackKey } from './lib/lrclib';
import { tunneledBytes, tunneledHttp } from './lib/net';
import { normalizeArtist, normalizeTitle } from './lib/normalize';
import { themeFromImage, type Theme } from './lib/palette';
import { HAS_JAPANESE, parseDict, type JaDict } from './lib/romaji';
import type { Playhead } from './lib/sync';

export interface PlayerView {
  conn: ConnectionState;
  state: PlayerState | null;
  head: Playhead | null;
}

export function usePlayer(client: BridgethingClient): PlayerView {
  const [conn, setConn] = useState<ConnectionState>(client.connectionState);
  const [state, setState] = useState<PlayerState | null>(null);
  const [head, setHead] = useState<Playhead | null>(null);

  useEffect(() => {
    const apply = (next: PlayerState) => {
      setState(next);
      setHead({
        positionMs: next.playback.positionMs,
        positionAgeMs: next.playback.positionAgeMs,
        playing: next.playback.state === 'playing',
        receivedAt: performance.now(),
      });
    };
    const offConn = client.on(event => {
      if (event.type === 'open' || event.type === 'close' || event.type === 'connecting') {
        setConn(client.connectionState);
      }
      if (event.type === 'open') client.player.stateGet().then(r => r.ok && apply(r.response.state));
    });
    const offSnapshot = client.player.onSnapshot(reply => apply(reply.state));
    client.player.stateGet().then(r => r.ok && apply(r.response.state));
    return () => {
      offConn();
      offSnapshot();
    };
  }, [client]);

  return { conn, state, head };
}

export function useArtwork(client: BridgethingClient, artworkId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!artworkId) {
      setUrl(null);
      return;
    }
    let revoked = false;
    let blobUrl: string | null = null;
    (async () => {
      const result = await client.asset.get({ id: artworkId, requestId: crypto.randomUUID() });
      if (revoked || !result.ok) return;
      const bytes = new Uint8Array(result.response.bytes as unknown as number[]);
      blobUrl = URL.createObjectURL(new Blob([bytes], { type: result.response.mime ?? 'image/jpeg' }));
      setUrl(blobUrl);
    })();
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [client, artworkId]);
  return url;
}

export function useTheme(artUrl: string | null): Theme | null {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    if (!artUrl) {
      setTheme(null);
      return;
    }
    let stale = false;
    themeFromImage(artUrl).then(t => !stale && setTheme(t));
    return () => {
      stale = true;
    };
  }, [artUrl]);
  return theme;
}

export type LyricsStatus = 'idle' | 'loading' | 'found' | 'none';

export interface LyricsView {
  status: LyricsStatus;
  lyrics: Lyrics | null;
}

export function useLyrics(client: BridgethingClient, state: PlayerState | null, facts: TrackFacts | null = null): LyricsView {
  const [view, setView] = useState<LyricsView>({ status: 'idle', lyrics: null });
  const cache = useRef(new Map<string, Lyrics | null>());
  const http = useRef(tunneledHttp(client));

  const track = state?.track ?? null;
  const key: TrackKey | null = track
    ? { title: normalizeTitle(track.title), artist: normalizeArtist(track.artist), durationMs: track.durationMs }
    : null;
  const id = key ? trackKeyId(key) : null;
  // deezer's spelling of the same song, tried when the player's spelling finds nothing
  const canonical: TrackKey | null =
    facts && key && (facts.title !== key.title || facts.artist !== key.artist)
      ? { title: normalizeTitle(facts.title), artist: normalizeArtist(facts.artist), durationMs: key.durationMs }
      : null;
  const canonicalId = canonical ? trackKeyId(canonical) : null;

  useEffect(() => {
    if (!key || !id) {
      setView({ status: 'idle', lyrics: null });
      return;
    }
    const cached = cache.current.get(id);
    if (cached) {
      setView({ status: 'found', lyrics: cached });
      return;
    }
    let stale = false;
    setView({ status: 'loading', lyrics: null });
    lookup(http.current, key)
      .catch(() => null)
      .then(found => (found?.synced || !canonical ? found : lookup(http.current, canonical).catch(() => found).then(alt => alt?.synced ? alt : (found ?? alt))))
      .then(found => {
        // a failed lookup is not cached so a busy lrclib gets retried on the next track change back
        if (found) cache.current.set(id, found);
        if (!stale) setView({ status: found ? 'found' : 'none', lyrics: found });
      });
    return () => {
      stale = true;
    };
    // the ids fold every field of the keys; the canonical one arrives later and re-runs this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, canonicalId]);

  // warm the cache for whatever comes next so the track change lands with words already on screen
  const queue = state?.queue ?? null;
  const queueIndex = state?.playback.queueIndex ?? null;
  const upcoming = queue && queue.length > 0 ? queue[queueIndex === null ? 0 : queueIndex + 1] : undefined;
  const upcomingKey: TrackKey | null = upcoming
    ? { title: normalizeTitle(upcoming.title), artist: normalizeArtist(upcoming.artist), durationMs: upcoming.durationMs }
    : null;
  const upcomingId = upcomingKey ? trackKeyId(upcomingKey) : null;
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    if (!upcomingKey || !upcomingId || upcomingId === id) return;
    if (cache.current.has(upcomingId) || inflight.current.has(upcomingId)) return;
    inflight.current.add(upcomingId);
    lookup(http.current, upcomingKey)
      .catch(() => null)
      .then(found => {
        inflight.current.delete(upcomingId);
        if (found) cache.current.set(upcomingId, found);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingId, id]);

  return view;
}

const OFFSET_KEY = 'sync-offset-ms';

export function useOffset(client: BridgethingClient): [number, (next: number) => void] {
  const [offset, setOffset] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    client.store.get({ key: OFFSET_KEY }).then(r => {
      if (!r.ok || r.response.value === null) return;
      const parsed = Number(r.response.value);
      if (Number.isFinite(parsed)) setOffset(parsed);
    });
  }, [client]);

  // stable identity: the input effect in App subscribes once per client
  const update = useCallback(
    (next: number) => {
      setOffset(next);
      if (timer.current) clearTimeout(timer.current);
      // presses come in bursts; persist once they settle
      timer.current = setTimeout(() => client.store.put({ key: OFFSET_KEY, value: String(next) }), 500);
    },
    [client],
  );

  return [offset, update];
}

let dictPromise: Promise<JaDict | null> | null = null;

// the japanese dictionary ships gzipped next to the page and is only inflated once a japanese line shows up
function loadDict(): Promise<JaDict | null> {
  if (!dictPromise) {
    dictPromise = (async () => {
      try {
        const res = await fetch('ja-dict.bin.gz');
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        // a server that sets content-encoding hands us the inflated text already; check the gzip magic
        const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
        const text = gzipped
          ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
          : new TextDecoder().decode(bytes);
        return parseDict(text);
      } catch {
        return null;
      }
    })();
  }
  return dictPromise;
}

export function useJaDict(lyrics: Lyrics | null): JaDict | null {
  const [dict, setDict] = useState<JaDict | null>(null);
  const needed = !!lyrics?.synced?.some(l => HAS_JAPANESE.test(l.text));
  useEffect(() => {
    if (!needed || dict) return;
    let stale = false;
    loadDict().then(d => !stale && setDict(d));
    return () => {
      stale = true;
    };
  }, [needed, dict]);
  return needed ? dict : null;
}

// bpm and loudness from deezer, looked up once per track and remembered on the device. the answer
// arrives whenever it arrives; the visuals run on the cadence estimate until then. the next track in
// the queue is looked up ahead of time so a track change lands with its tempo already known.
// the preview is 30 seconds of mp3; decoding and analysing it takes well under a second and runs
// off the frame. a weak beat (quiet intros, rubato) is discarded rather than trusted.
const MIN_BEAT_CONFIDENCE = 0.3;
const ANALYSIS_RATE = 22050;

async function analysePreview(client: BridgethingClient, url: string): Promise<{ bpm: number | null; energy: number } | null> {
  const bytes = await tunneledBytes(client, url);
  if (!bytes) return null;
  const ctx = new OfflineAudioContext(1, ANALYSIS_RATE * 31, ANALYSIS_RATE);
  const buffer = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const r = analyze(buffer.getChannelData(0), buffer.sampleRate);
  return { bpm: r.confidence >= MIN_BEAT_CONFIDENCE && r.bpm > 0 ? r.bpm : null, energy: r.energy };
}

export function useFacts(client: BridgethingClient, state: PlayerState | null): TrackFacts | null {
  const [facts, setFacts] = useState<TrackFacts | null>(null);
  const cache = useRef(new Map<string, TrackFacts | null>());
  const inflight = useRef(new Set<string>());
  const http = useRef(tunneledHttp(client));

  const keyFor = (t: { title: string | null; artist: string | null; durationMs: number | null } | null | undefined): TrackKey | null =>
    t ? { title: normalizeTitle(t.title), artist: normalizeArtist(t.artist), durationMs: t.durationMs } : null;

  const key = keyFor(state?.track);
  const id = key ? trackKeyId(key) : null;
  const queue = state?.queue ?? null;
  const queueIndex = state?.playback.queueIndex ?? null;
  const upcomingKey = keyFor(queue && queue.length > 0 ? queue[queueIndex === null ? 0 : queueIndex + 1] : null);
  const upcomingId = upcomingKey ? trackKeyId(upcomingKey) : null;

  const fetchInto = (k: TrackKey, kid: string, onDone?: (f: TrackFacts | null) => void) => {
    if (cache.current.has(kid) || inflight.current.has(kid)) {
      onDone?.(cache.current.get(kid) ?? null);
      return;
    }
    inflight.current.add(kid);
    const stored = `facts:${kid}`;
    client.store
      .get({ key: stored })
      .then(r => {
        if (r.ok && r.response.value) {
          const parsed = JSON.parse(r.response.value) as TrackFacts;
          cache.current.set(kid, parsed);
          return parsed;
        }
        return lookupFacts(http.current, k).then(async found => {
          // no bpm from deezer but a preview: measure it ourselves; energy comes along either way
          if (found?.previewUrl && (found.bpm === null || found.energy === null)) {
            const measured = await analysePreview(client, found.previewUrl).catch(() => null);
            if (measured) {
              found = {
                ...found,
                bpm: found.bpm ?? measured.bpm,
                bpmSource: found.bpm ? 'deezer' : measured.bpm ? 'preview' : null,
                energy: measured.energy,
              };
            }
          }
          cache.current.set(kid, found);
          if (found) client.store.put({ key: stored, value: JSON.stringify(found) });
          return found;
        });
      })
      .catch(() => null)
      .then(found => {
        inflight.current.delete(kid);
        onDone?.(found ?? null);
      });
  };

  useEffect(() => {
    if (!key || !id) {
      setFacts(null);
      return;
    }
    let stale = false;
    setFacts(cache.current.get(id) ?? null);
    fetchInto(key, id, f => !stale && setFacts(f));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (upcomingKey && upcomingId && upcomingId !== id) fetchInto(upcomingKey, upcomingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingId, id]);

  return facts;
}
