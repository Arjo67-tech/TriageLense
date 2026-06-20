// ──────────────────────────────────────────────────────────
//  Small DSP helpers shared by the extractors. Pure, no DOM.
// ──────────────────────────────────────────────────────────
import type { Landmark } from "../mediapipe/indices";

export const mean = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

export const variance = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length;
};

export const std = (a: number[]) => Math.sqrt(variance(a));

/** Coefficient of variation (std / mean), guarded for tiny means. */
export const cv = (a: number[]) => {
  const m = mean(a);
  return Math.abs(m) < 1e-6 ? 0 : std(a) / Math.abs(m);
};

export const dist = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const dist3 = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/** Slope of y over x via least squares (x usually = time in seconds). */
export function slope(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den < 1e-9 ? 0 : num / den;
}

/** Count peaks (local maxima above a prominence) in a 1-D series. Returns the
 *  peak indices. Used for tap counting and breath counting. */
export function findPeaks(
  y: number[],
  minProminence: number,
  minGap = 3,
): number[] {
  const peaks: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > y[i - 1] && y[i] >= y[i + 1]) {
      // local maximum; check prominence vs recent minimum
      let lo = y[i];
      for (let j = Math.max(0, i - 10); j < i; j++) lo = Math.min(lo, y[j]);
      if (y[i] - lo >= minProminence && i - last >= minGap) {
        peaks.push(i);
        last = i;
      }
    }
  }
  return peaks;
}

/** Dominant frequency (Hz) of a uniformly-ish sampled signal via a coarse DFT
 *  over a band. Returns { freq, power } where power is normalized 0..1-ish. */
export function dominantFrequency(
  signal: number[],
  fps: number,
  band: [number, number],
): { freq: number; power: number } {
  const n = signal.length;
  if (n < 8 || fps <= 0) return { freq: 0, power: 0 };
  const m = mean(signal);
  const x = signal.map((v) => v - m);
  const totalEnergy = x.reduce((a, b) => a + b * b, 0) / n || 1e-9;

  let bestFreq = 0;
  let bestPower = 0;
  const step = 0.1;
  for (let f = band[0]; f <= band[1]; f += step) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const ph = (2 * Math.PI * f * i) / fps;
      re += x[i] * Math.cos(ph);
      im -= x[i] * Math.sin(ph);
    }
    const power = (re * re + im * im) / (n * n);
    if (power > bestPower) {
      bestPower = power;
      bestFreq = f;
    }
  }
  // normalize peak power against total signal energy → ~0..1 oscillation ratio
  return { freq: bestFreq, power: Math.min(1, bestPower / totalEnergy) };
}

/** Cumulative 2-D path length of a sequence of points. */
export function pathLength(pts: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return s;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
