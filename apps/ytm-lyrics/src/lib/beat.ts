// tempo from audio, on the device: an onset envelope from frame energy, then autocorrelation over
// the lags that correspond to musical tempos. thirty seconds of a preview is plenty for a steady song.

export interface BeatAnalysis {
  bpm: number;
  // 0..1, how much the best lag stands out; below ~0.3 the guess is weak
  confidence: number;
  // 0..1 mean loudness of the clip, for how lively the visuals should be
  energy: number;
}

const HOP = 512;
const MIN_BPM = 60;
const MAX_BPM = 200;
// tempos land here for most popular music; a raw peak outside is folded in by halving or doubling
const PREFER_LO = 80;
const PREFER_HI = 170;

export function onsetEnvelope(samples: Float32Array, hop = HOP): Float32Array {
  const frames = Math.floor(samples.length / hop);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) sum += samples[base + i] * samples[base + i];
    energy[f] = Math.sqrt(sum / hop);
  }
  const onset = new Float32Array(frames);
  let max = 0;
  for (let f = 1; f < frames; f++) {
    const d = energy[f] - energy[f - 1];
    onset[f] = d > 0 ? d : 0;
    if (onset[f] > max) max = onset[f];
  }
  if (max > 0) for (let f = 0; f < frames; f++) onset[f] /= max;
  return onset;
}

function fold(bpm: number): number {
  let b = bpm;
  while (b < PREFER_LO) b *= 2;
  while (b > PREFER_HI) b /= 2;
  return b;
}

export function tempoFromOnsets(onset: Float32Array, frameRate: number): { bpm: number; confidence: number } {
  const minLag = Math.max(1, Math.floor((60 / MAX_BPM) * frameRate));
  const maxLag = Math.min(onset.length - 1, Math.ceil((60 / MIN_BPM) * frameRate));
  let mean = 0;
  for (let i = 0; i < onset.length; i++) mean += onset[i];
  mean /= onset.length || 1;
  let best = 0;
  let bestLag = 0;
  let total = 0;
  let count = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < onset.length; i++) acc += (onset[i] - mean) * (onset[i - lag] - mean);
    acc /= onset.length - lag;
    total += acc;
    count += 1;
    if (acc > best) {
      best = acc;
      bestLag = lag;
    }
  }
  if (bestLag === 0) return { bpm: 0, confidence: 0 };
  // parabolic refinement of the peak lag from its neighbours
  const at = (lag: number) => {
    let acc = 0;
    for (let i = lag; i < onset.length; i++) acc += (onset[i] - mean) * (onset[i - lag] - mean);
    return acc / (onset.length - lag);
  };
  const l = bestLag > minLag ? at(bestLag - 1) : best;
  const r = bestLag < maxLag ? at(bestLag + 1) : best;
  const denom = l - 2 * best + r;
  const shift = denom !== 0 ? (0.5 * (l - r)) / denom : 0;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = fold((60 * frameRate) / lag);
  const avg = count > 0 ? total / count : 0;
  const confidence = best > 0 ? Math.max(0, Math.min(1, (best - avg) / best)) : 0;
  return { bpm: Math.round(bpm * 10) / 10, confidence };
}

export function analyze(samples: Float32Array, sampleRate: number): BeatAnalysis {
  const onset = onsetEnvelope(samples);
  const { bpm, confidence } = tempoFromOnsets(onset, sampleRate / HOP);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / (samples.length || 1));
  // -34 dBFS rms is a whisper, -8 is a mastered chorus; map that band onto 0..1
  const db = 20 * Math.log10(rms || 1e-6);
  const energy = Math.max(0, Math.min(1, (db + 34) / 26));
  return { bpm, confidence, energy };
}
