// ──────────────────────────────────────────────────────────
//  Hands extractors (MediaPipe Hands):
//    TapExtractor    → finger-tapping rhythm/amplitude per hand
//    TremorExtractor → postural tremor (3–7 Hz oscillation)
// ──────────────────────────────────────────────────────────
import type { FeatureBag } from "../types";
import type { Landmark } from "../mediapipe/indices";
import type { HandFrame } from "../mediapipe/hands";
import { HAND } from "../mediapipe/indices";
import {
  clamp01,
  cv,
  dist,
  dominantFrequency,
  findPeaks,
  mean,
  std,
} from "./signal";

function handBySide(
  frame: HandFrame,
  side: "left" | "right",
): Landmark[] | null {
  const want = side === "left" ? "Left" : "Right";
  const exact = frame.hands.find((h) => h.handedness === want);
  if (exact) return exact.landmarks;
  // if exactly one hand is visible, fall back to it (handedness can flip on mirror)
  if (frame.hands.length === 1) return frame.hands[0].landmarks;
  return null;
}

// ── Finger tapping (one instance per hand) ─────────────────
export class TapExtractor {
  private side: "left" | "right";
  private t: number[] = [];
  private d: number[] = []; // thumb-index distance / palm size
  private frames = 0;
  private goodFrames = 0;

  constructor(side: "left" | "right") {
    this.side = side;
  }

  reset() {
    this.t = [];
    this.d = [];
    this.frames = 0;
    this.goodFrames = 0;
  }

  push(frame: HandFrame, tMs: number) {
    this.frames++;
    const lm = handBySide(frame, this.side);
    if (!lm) return;
    const palm = Math.max(0.02, dist(lm[HAND.WRIST], lm[HAND.INDEX_MCP]));
    const sep = dist(lm[HAND.THUMB_TIP], lm[HAND.INDEX_TIP]) / palm;
    this.goodFrames++;
    this.t.push(tMs);
    this.d.push(sep);
  }

  snapshot(): FeatureBag {
    const side = this.side;
    const n = this.d.length;
    const visibility = this.frames ? this.goodFrames / this.frames : 0;
    if (n < 12) {
      return {
        [`${side}_tap_frequency_hz`]: 0,
        [`${side}_mean_tap_amplitude`]: 0,
        [`${side}_tap_interval_variability`]: 0,
        [`${side}_amplitude_decay`]: 0,
        [`${side}_pause_count`]: 0,
        [`${side}_tap_quality`]: clamp01(visibility * 0.3),
      };
    }
    const durSec = (this.t[n - 1] - this.t[0]) / 1000 || 1;
    const fps = n / durSec;

    const sd = std(this.d) || 1e-6;
    const minGap = Math.max(2, Math.floor(fps * 0.12));
    const peaks = findPeaks(this.d, sd * 0.5, minGap);

    const freq = peaks.length / durSec;

    // amplitude per tap = peak value − the trough just before it
    const amps: number[] = [];
    for (let i = 0; i < peaks.length; i++) {
      const start = i === 0 ? 0 : peaks[i - 1];
      let trough = Infinity;
      for (let j = start; j <= peaks[i]; j++) trough = Math.min(trough, this.d[j]);
      amps.push(this.d[peaks[i]] - trough);
    }
    const meanAmp = amps.length ? mean(amps) : 0;

    // interval variability + pauses
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++)
      intervals.push((peaks[i] - peaks[i - 1]) / fps);
    const intervalCV = intervals.length ? cv(intervals) : 0;
    const medInt = intervals.length
      ? intervals.slice().sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
      : 0;
    const pauseCount = intervals.filter((iv) => medInt > 0 && iv > medInt * 1.8)
      .length;

    // amplitude decay: first third vs last third of taps
    let decay = 0;
    if (amps.length >= 6) {
      const k = Math.floor(amps.length / 3);
      const first = mean(amps.slice(0, k));
      const last = mean(amps.slice(-k));
      decay = first > 1e-6 ? clamp01(1 - last / first) : 0;
    }

    const quality =
      peaks.length >= 3 ? clamp01(visibility) : clamp01(visibility * 0.4);

    return {
      [`${side}_tap_frequency_hz`]: freq,
      [`${side}_mean_tap_amplitude`]: meanAmp,
      [`${side}_tap_interval_variability`]: intervalCV,
      [`${side}_amplitude_decay`]: decay,
      [`${side}_pause_count`]: pauseCount,
      [`${side}_tap_peaks`]: peaks.length,
      [`${side}_tap_quality`]: quality,
    };
  }
}

/** Combine two per-hand tap snapshots into the L/R asymmetry feature. */
export function tapAsymmetry(left: FeatureBag, right: FeatureBag): FeatureBag {
  const lf = (left["left_tap_frequency_hz"] as number) ?? 0;
  const rf = (right["right_tap_frequency_hz"] as number) ?? 0;
  const la = (left["left_mean_tap_amplitude"] as number) ?? 0;
  const ra = (right["right_mean_tap_amplitude"] as number) ?? 0;
  const relDiff = (a: number, b: number) => {
    const m = Math.max(a, b);
    return m < 1e-6 ? 0 : Math.abs(a - b) / m;
  };
  // worst of frequency-asymmetry and amplitude-asymmetry
  const asym = Math.max(relDiff(lf, rf), relDiff(la, ra));
  return { tap_left_right_asymmetry: asym };
}

// ── Postural tremor ────────────────────────────────────────
export class TremorExtractor {
  private t: number[] = [];
  private x: number[] = [];
  private y: number[] = [];
  private scale: number[] = [];
  private frames = 0;
  private goodFrames = 0;

  reset() {
    this.t = [];
    this.x = [];
    this.y = [];
    this.scale = [];
    this.frames = 0;
    this.goodFrames = 0;
  }

  push(frame: HandFrame, tMs: number) {
    this.frames++;
    if (!frame.hands.length) return;
    // track the index fingertip of the first detected hand
    const lm = frame.hands[0].landmarks;
    const palm = Math.max(0.02, dist(lm[HAND.WRIST], lm[HAND.INDEX_MCP]));
    this.goodFrames++;
    this.t.push(tMs);
    this.x.push(lm[HAND.INDEX_TIP].x);
    this.y.push(lm[HAND.INDEX_TIP].y);
    this.scale.push(palm);
  }

  snapshot(): FeatureBag {
    const n = this.x.length;
    const visibility = this.frames ? this.goodFrames / this.frames : 0;
    if (n < 16) {
      return {
        tremor_like_motion_score: 0,
        tremor_frequency_hz: 0,
        tremor_amplitude: 0,
        tremor_quality: clamp01(visibility * 0.3),
      };
    }
    const durSec = (this.t[n - 1] - this.t[0]) / 1000 || 1;
    const fps = n / durSec;
    const scale = mean(this.scale) || 0.05;

    const fx = dominantFrequency(this.x, fps, [3, 7]);
    const fy = dominantFrequency(this.y, fps, [3, 7]);
    const best = fx.power >= fy.power ? fx : fy;
    const amp = (std(this.x) + std(this.y)) / 2 / scale;

    // dominantFrequency() caps a pure tone's normalized power at ~0.5, so
    // rescale to a 0..1 "how sinusoidal" ratio before blending with amplitude.
    const oscRatio = clamp01(best.power * 2);
    const score = clamp01(oscRatio * 0.7 + clamp01(amp / 0.15) * 0.3);
    const quality =
      n >= 16 && fps >= 12 ? clamp01(visibility) : clamp01(visibility * 0.4);

    return {
      tremor_like_motion_score: score,
      tremor_frequency_hz: best.freq,
      tremor_amplitude: amp,
      tremor_power: best.power,
      tremor_fps: fps,
      tremor_quality: quality,
    };
  }
}
