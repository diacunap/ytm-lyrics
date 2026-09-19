# ytm-lyrics

## 1.2.2

long latin words carry soft hyphens at syllable boundaries and break with a dash instead of leaving the stage

## 1.2.1

lyrics and facts are cached by title and artist, so a seek's momentary duration change no longer shows a lookup or resets the stage

## 1.2.0

word fill moves to a composited clip-path reveal (no paint, no per-word layers), twenty-odd svg silhouettes in genre packs, a second voice per genre for the chorus, romanization cached

## 1.1.0

a typeface per genre family (Anton, Space Grotesk, DM Serif Display, Syne), plain ink on the sung word, the position loop at 20 Hz with ring and clock at 5 Hz

## 1.0.0

line changes no longer stall: upcoming lines are measured in idle time and the chorus flash drops its brightness filter. deezer facts grow: tempo measured on the device from the 30s preview when deezer has none, loudness and energy driving stage intensity, genre packs for the shapes, canonical title as a second lyrics search, release year on the intro card

## 0.9.3

the track intro keys on title+artist and waits 500 ms of stable metadata, so a seek no longer replays it

## 0.9.2

word fill finishes before the breath at the end of each line, tempo estimate corrected for breaths, 150 ms perceptual lead on word fill and 120 ms on line changes

## 0.9.1

lrclib: free-text fallbacks reach uploads filed under romanized or english titles (kanji title in music mode); cross-script relevance by artist

## 0.9.0

track intro: the new cover slides in at full height and brakes at the left edge with title and artist, holds two seconds, then leaves left; fires on every track change

## 0.8.0

deezer bpm/loudness looked up async off the render path, cached on the device, prefetched for the next queued track; shapes breathe on the beat; tempo readout

## 0.7.0

frame-rate budget with automatic lite visuals, chorus/hook detection driving entrances and stage intensity, ambient clock when idle, thicker high-contrast progress ring with a larger head

## 0.6.0

five-color artwork palette with cycling gradient layers and drifting shapes, light theme for pale covers, touch ripples and an arming swipe trail

## 0.5.3

the word being sung fills in the artwork accent color, white once done

## 0.5.2

music-mark lines (♪ …) are instrumental markers: dropped from the lyrics and used as the previous line's end

## 0.5.1

prefer a synced upload over a plain-only exact lrclib hit; romaji is the main karaoke line with the japanese underneath

## 0.5.0

on-device romaji (JMdict/KANJIDIC2 compact dictionary, okurigana-aware), mora/syllable word timing with per-song tempo, next-line countdown, instrumental visualizer with artwork palette and estimated pulse

## 0.4.0

css-driven word fill (no per-frame js), palette-colored ring with glowing head and line sweep, intermission dots, active word pop, drifting artwork gradient with crossfade, next-track lyric prefetch

## 0.3.2

presets 2/3 nudge lyric sync by 100 ms

## 0.3.1

touch gestures (swipe prev/next, double tap ±5s, tap play/pause, swipe up/down karaoke), wheel is always volume, coalesced optimistic seek

## 0.3.0

super karaoke: Syne display font, auto-fit type filling the stage, cjk-safe word breaks

## 0.2.1

wheel volume uses volumeUp/volumeDown

## 0.2.0

progress ring, 2-line wrap, wheel modes (track/volume), super karaoke mode with word fill and artwork gradient

## 0.1.0

First release.
