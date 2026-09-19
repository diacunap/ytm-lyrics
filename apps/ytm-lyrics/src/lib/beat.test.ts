import { describe, expect, test } from 'bun:test';

import { analyze } from './beat';

// a click track with decaying noise bursts on every beat, plus a quiet noise floor
function clicks(bpm: number, seconds: number, sampleRate: number, amplitude = 0.5, offbeats = false): Float32Array {
  const out = new Float32Array(seconds * sampleRate);
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let i = 0; i < out.length; i++) out[i] = rand() * 0.01;
  const period = (60 / bpm) * sampleRate;
  for (let beat = 0; beat * period < out.length; beat++) {
    const start = Math.floor(beat * period);
    const strength = offbeats && beat % 2 === 1 ? amplitude * 0.5 : amplitude;
    for (let i = 0; i < 2000 && start + i < out.length; i++) out[start + i] += rand() * strength * Math.exp(-i / 500);
  }
  return out;
}

describe('analyze', () => {
  const sr = 22050;
  test.each([90, 120, 128, 140, 160])('finds %i bpm from a click track', bpm => {
    const r = analyze(clicks(bpm, 20, sr), sr);
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(2);
    expect(r.confidence).toBeGreaterThan(0.3);
  });
  test('folds a slow pulse into the preferred range', () => {
    const r = analyze(clicks(60, 20, sr), sr);
    expect(Math.abs(r.bpm - 120)).toBeLessThan(2);
  });
  test('accented offbeats do not halve the tempo', () => {
    const r = analyze(clicks(130, 20, sr, 0.5, true), sr);
    expect(Math.abs(r.bpm - 130)).toBeLessThan(2);
  });
  test('silence has no confidence and no energy', () => {
    const r = analyze(new Float32Array(sr * 5), sr);
    expect(r.confidence).toBe(0);
    expect(r.energy).toBe(0);
  });
  test('energy grows with loudness', () => {
    const quiet = analyze(clicks(120, 10, sr, 0.1), sr).energy;
    const loud = analyze(clicks(120, 10, sr, 0.9), sr).energy;
    expect(loud).toBeGreaterThan(quiet);
  });
});
