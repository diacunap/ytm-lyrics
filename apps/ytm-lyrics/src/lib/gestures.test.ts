import { describe, expect, test } from 'bun:test';

import { TapFolder, classify, side } from './gestures';

const stroke = (dx: number, dy: number, dt = 200) => ({ x0: 400, y0: 240, x1: 400 + dx, y1: 240 + dy, dt });

describe('classify', () => {
  test.each([
    [stroke(0, 0), 'tap'],
    [stroke(5, -8), 'tap'],
    [stroke(3, 3, 900), null],
    [stroke(-120, 10), 'swipe-left'],
    [stroke(150, -30), 'swipe-right'],
    [stroke(10, -90), 'swipe-up'],
    [stroke(-20, 110), 'swipe-down'],
    [stroke(80, 70), null],
    [stroke(-200, 0, 1200), null],
    [stroke(40, 0), null],
  ])('%o → %s', (s, expected) => {
    expect(classify(s)).toBe(expected as ReturnType<typeof classify>);
  });
});

describe('side', () => {
  test('splits the screen down the middle', () => {
    expect(side(10)).toBe('left');
    expect(side(399)).toBe('left');
    expect(side(400)).toBe('right');
    expect(side(790)).toBe('right');
  });
});

describe('TapFolder', () => {
  test('two quick taps become one double', async () => {
    const singles: number[] = [];
    const doubles: number[] = [];
    const f = new TapFolder(x => singles.push(x), x => doubles.push(x), 50);
    f.tap(100, 0);
    f.tap(120, 30);
    await new Promise(r => setTimeout(r, 80));
    expect(doubles).toEqual([120]);
    expect(singles).toEqual([]);
  });

  test('a lone tap becomes a single after the window', async () => {
    const singles: number[] = [];
    const doubles: number[] = [];
    const f = new TapFolder(x => singles.push(x), x => doubles.push(x), 50);
    f.tap(600, 0);
    expect(singles).toEqual([]);
    await new Promise(r => setTimeout(r, 80));
    expect(singles).toEqual([600]);
    expect(doubles).toEqual([]);
  });

  test('two slow taps are two singles', async () => {
    const singles: number[] = [];
    const f = new TapFolder(x => singles.push(x), () => {}, 50);
    f.tap(1, 0);
    await new Promise(r => setTimeout(r, 80));
    f.tap(2, 500);
    await new Promise(r => setTimeout(r, 80));
    expect(singles).toEqual([1, 2]);
  });
});
