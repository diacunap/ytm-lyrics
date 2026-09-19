# ytm-lyrics

Synced lyrics and a full-screen karaoke mode for the **Spotify Car Thing**, running on [bridgething](https://bridgething.com). It shows whatever your computer or phone is playing — built for YouTube Music, works with anything that publishes to the system's now-playing.

Everything runs on the device. No LLMs, no accounts, no servers of ours. The only network calls are [LRCLIB](https://lrclib.net) for lyrics and [Deezer](https://developers.deezer.com/api) for tempo, both public and keyless, both cached on the device.

## What it does

- **Synced lyrics** from LRCLIB, matched by title, artist and duration, with free-text fallbacks that find uploads filed under romanized or English titles (a kanji title in YouTube Music's music mode, "Kaiju" in video mode — same song).
- **Super karaoke**: one line at a time filling the screen, **word by word**, timed by morae (Japanese) or syllables (everything else) with a tempo calibrated per song from the lyrics' own cadence. The fill is a CSS animation; nothing runs in JavaScript per frame.
- **Romaji on the device** for Japanese lyrics: a 278 KB dictionary built from JMdict and KANJIDIC2 (35 k words, 3 k kanji), okurigana-aware, with the platform's word segmenter for boundaries. Romaji is the big line; the original sits under it.
- **A stage that answers the song**: a five-color palette pulled from the artwork, gradient layers that cycle and drift, translucent shapes crossing on the x axis, a light theme when the cover is pale, a chorus that raises the intensity, a hook that slams in. All transforms and opacity.
- **Tempo**: Deezer's `bpm` when it has one; otherwise the 30-second preview is decoded on the device and analysed (onset envelope + autocorrelation) for a real tempo; otherwise the lyric cadence. The shapes and the cover breathe on it.
- **Track intro**: on every change, the new cover slides in at full height and brakes at the left edge with title and artist, holds two seconds, and leaves.
- **Instrumental view** for songs without lyrics, an **ambient clock** when nothing plays, **touch feedback** (ripples, an arming swipe trail that relaxes if you come back), and a **frame-rate budget** that drops to lite visuals when the panel cannot hold 40 fps.

## Controls

| Input | Action |
| --- | --- |
| Tap | play / pause |
| Swipe left / right | next / previous |
| Double tap, left / right half | −5 s / +5 s |
| Swipe up / down | enter / leave super karaoke |
| Wheel | volume |
| Preset 1, wheel click | play / pause |
| Back (below the wheel) | toggle super karaoke |

## Layout

```
apps/ytm-lyrics/
  src/
    App.tsx           player, input, ring, view switching
    Karaoke.tsx       the big line, word fill, romaji, intermission dots
    Backdrop.tsx      palette gradients, drifting shapes, quality tiers
    Instrumental.tsx  cover + tempo pulse for songs without lyrics
    Ambient.tsx       clock when idle
    TrackIntro.tsx    the cover card on track change
    TouchFx.tsx       ripples and swipe trail
    hooks.ts          player state, artwork, lyrics (+ prefetch), theme, dictionary, deezer facts
    lib/
      lrclib.ts       lookup with duration matching and free-text fallbacks
      lrc.ts          LRC parser; ♪ lines become the previous line's end
      words.ts        per-word spans, beat-weighted, breath-aware
      tempo.ts        morae / syllables, per-song tempo, bpm estimate
      romaji.ts       kana table, dictionary readings, okurigana, particles
      beat.ts         tempo and energy from audio samples
      palette.ts      artwork colors, light/dark theme
      structure.ts    chorus / hook detection from repetition
      fit.ts          idle-time text fitting so a line change costs no layout
      gestures.ts     tap / double tap / swipe classification
      quality.ts      frame-rate sampler with hysteresis
      deezer.ts       search + track facts
  scripts/build-dict.ts   builds public/ja-dict.bin.gz from JMdict_e and kanjidic2.xml
docs/                     architecture decision record and plan
```

## Develop

```sh
bun install
bun run --cwd apps/ytm-lyrics typecheck
bun test apps/ytm-lyrics/src/lib      # 145 tests, all pure modules
bun run check                          # the CI gate: typecheck, build, bundle, catalog
bun run --cwd apps/ytm-lyrics dev      # against a connected Car Thing
bun run --cwd apps/ytm-lyrics push     # build and install onto the device
bun run --cwd apps/ytm-lyrics share    # zip to install from the companion app
```

Rebuild the Japanese dictionary (sources from [EDRDG](https://www.edrdg.org/)):

```sh
bun apps/ytm-lyrics/scripts/build-dict.ts JMdict_e kanjidic2.xml
```

## Known limits

- The Car Thing never hears the audio. Word timing is interpolated from line timestamps; tempo comes from Deezer, the preview analysis or the lyric cadence, in that order.
- LRCLIB is community data: the odd upload is synced against a different edition of a song.
- Kanji readings come from a compact dictionary; a name or a poetic reading it does not know is shown as the kanji, never guessed.
- bridgething picks the source (phone or computer) itself; when both are connected the last one that changed state wins.

## Credits

- [bridgething](https://github.com/JoeyEamigh/bridgething) — the firmware, daemon and SDK this runs on.
- [LRCLIB](https://lrclib.net) — lyrics.
- [Deezer API](https://developers.deezer.com/api) — tempo and track facts.
- [JMdict and KANJIDIC2](https://www.edrdg.org/edrdg/licence.html) by the EDRDG, CC BY-SA 4.0 — the dictionary asset.
- [Syne](https://gitlab.com/bonjour-monde/fonderie/syne-typeface), [Outfit](https://github.com/Outfitio/Outfit-Fonts), [Inter](https://rsms.me/inter/) — OFL typefaces.

## License

MIT for the code in this repository. Bundled fonts and the dictionary asset keep their own licenses (see `src/fonts/*-OFL.txt` and `public/ja-dict-LICENSE.txt`).
