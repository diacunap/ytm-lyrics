import { describe, expect, test } from 'bun:test';

import { lineIndexAt, projectPosition } from './sync';

const lines = [
  { startMs: 0, text: 'a' },
  { startMs: 1000, text: 'b' },
  { startMs: 2500, text: 'c' },
  { startMs: 9000, text: 'd' },
];

describe('lineIndexAt', () => {
  test('-1 before the first line', () => {
    expect(lineIndexAt([{ startMs: 500, text: 'x' }], 0)).toBe(-1);
  });
  test('exact stamp selects that line', () => {
    expect(lineIndexAt(lines, 1000)).toBe(1);
  });
  test('between stamps selects the earlier line', () => {
    expect(lineIndexAt(lines, 2499)).toBe(1);
    expect(lineIndexAt(lines, 5000)).toBe(2);
  });
  test('past the end stays on the last line', () => {
    expect(lineIndexAt(lines, 100_000)).toBe(3);
  });
  test('empty list', () => {
    expect(lineIndexAt([], 10)).toBe(-1);
  });
});

describe('projectPosition', () => {
  test('advances with wall clock while playing', () => {
    const head = { positionMs: 10_000, positionAgeMs: null, playing: true, receivedAt: 1000 };
    expect(projectPosition(head, 1750)).toBe(10_750);
  });
  test('adds the reported age of the snapshot', () => {
    const head = { positionMs: 10_000, positionAgeMs: 200, playing: true, receivedAt: 1000 };
    expect(projectPosition(head, 1000)).toBe(10_200);
  });
  test('freezes while paused', () => {
    const head = { positionMs: 10_000, positionAgeMs: 200, playing: false, receivedAt: 1000 };
    expect(projectPosition(head, 9000)).toBe(10_000);
  });
  test('applies the user offset and clamps at zero', () => {
    const head = { positionMs: 100, positionAgeMs: null, playing: false, receivedAt: 0 };
    expect(projectPosition(head, 0, 300)).toBe(400);
    expect(projectPosition(head, 0, -300)).toBe(0);
  });
});
