import { describe, expect, test } from 'bun:test';

import { normalizeArtist, normalizeTitle } from './normalize';

describe('normalizeTitle', () => {
  test.each([
    ['Where Our Blue Is (Acoustic version)', 'Where Our Blue Is'],
    ['Song Name (Official Video)', 'Song Name'],
    ['Song Name [Official Lyric Video]', 'Song Name'],
    ['Song Name (feat. Someone)', 'Song Name'],
    ['Song Name feat. Someone', 'Song Name'],
    ['Song Name | Visualizer', 'Song Name'],
    ['Song Name - Official Audio', 'Song Name'],
    ['Song (Remastered 2011)', 'Song'],
    ['Plain Title', 'Plain Title'],
    ['Keep (These) Parens', 'Keep (These) Parens'],
    [null, ''],
  ])('%s → %s', (input: string | null | undefined, expected: string) => {
    expect(normalizeTitle(input)).toBe(expected);
  });
});

describe('normalizeArtist', () => {
  test.each([
    ['Tatsuya Kitani', 'Tatsuya Kitani'],
    ['Tatsuya Kitani - Topic', 'Tatsuya Kitani'],
    ['ArtistVEVO', 'Artist'],
    ['A, B & C', 'A'],
    ['A feat. B', 'A'],
    ['A x B', 'A'],
    [undefined, ''],
  ])('%s → %s', (input: string | null | undefined, expected: string) => {
    expect(normalizeArtist(input)).toBe(expected);
  });
});
