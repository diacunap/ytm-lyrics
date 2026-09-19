import { describe, expect, test } from 'bun:test';

import { parseLrc } from './lrc';

describe('parseLrc', () => {
  test('parses centisecond stamps in order', () => {
    const lines = parseLrc('[00:12.50]first\n[00:01.00]zero\n[01:02.03]later');
    expect(lines).toEqual([
      { startMs: 1000, text: 'zero' },
      { startMs: 12500, text: 'first' },
      { startMs: 62030, text: 'later' },
    ]);
  });

  test('accepts millisecond stamps', () => {
    expect(parseLrc('[00:05.123]x')).toEqual([{ startMs: 5123, text: 'x' }]);
  });

  test('expands repeated stamps into separate lines', () => {
    const lines = parseLrc('[00:10.00][00:40.00]chorus');
    expect(lines).toEqual([
      { startMs: 10000, text: 'chorus' },
      { startMs: 40000, text: 'chorus' },
    ]);
  });

  test('skips metadata tags, blank lines and empty stamps', () => {
    const lines = parseLrc('[ar:Someone]\n[ti:Song]\n\n[00:00.00]\n[00:03.00]hello');
    expect(lines).toEqual([{ startMs: 3000, text: 'hello' }]);
  });

  test('a music-mark line ends the previous lyric instead of becoming one', () => {
    const lines = parseLrc('[00:01.00]verse\n[00:04.50]♪\n[00:20.00]chorus\n[00:23.00]…\n[00:24.00] ♪ ♪ ');
    expect(lines).toEqual([
      { startMs: 1000, text: 'verse', endMs: 4500 },
      { startMs: 20000, text: 'chorus', endMs: 23000 },
    ]);
  });

  test('keeps a bracket inside the lyric text', () => {
    expect(parseLrc('[00:03.00]hey [x2]')).toEqual([{ startMs: 3000, text: 'hey [x2]' }]);
  });

  test('handles CRLF', () => {
    expect(parseLrc('[00:01.00]a\r\n[00:02.00]b').map(l => l.text)).toEqual(['a', 'b']);
  });
});
