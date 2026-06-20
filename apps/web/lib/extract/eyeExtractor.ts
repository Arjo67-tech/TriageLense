// ──────────────────────────────────────────────────────────
//  Eye-tracking extractor (concussion eye step).
//  A dot moves on screen; we estimate horizontal gaze from the
//  iris position relative to the eye corners and cross-correlate
//  it against the dot's path to get lag / smoothness / misses.
// ──────────────────────────────────────────────────────────
import type { FeatureBag } from "../types";
import type { FaceFrame } from "../mediapipe/face";
import { FACE } from "../mediapipe/indices";
import { clamp01, mean, std } from "./signal";

export class EyeTrackingExtractor {
  private t: number[] = [];
  private gaze: number[] = [];
  private dot: number[] = [];
  private frames = 0;
  private goodFrames = 0;

  reset() {
    this.t = [];
    this.gaze = [];
    this.dot = [];
    this.frames = 0;
    this.goodFrames = 0;
  }

  /** dotX is the target's normalized horizontal position (0..1). */
  push(frame: FaceFrame, dotX: number, tMs: number) {
    this.frames++;
    const lm = frame.landmarks;
    if (!lm || lm.length < 478) return; // need iris landmarks
    this.goodFrames++;
    // horizontal gaze ratio per eye: iris position between inner/outer corners
    const lr =
      (lm[FACE.LEFT_IRIS].x - lm[FACE.LEFT_EYE_INNER].x) /
      ((lm[FACE.LEFT_EYE_OUTER].x - lm[FACE.LEFT_EYE_INNER].x) || 1e-6);
    const rr =
      (lm[FACE.RIGHT_IRIS].x - lm[FACE.RIGHT_EYE_INNER].x) /
      ((lm[FACE.RIGHT_EYE_OUTER].x - lm[FACE.RIGHT_EYE_INNER].x) || 1e-6);
    this.t.push(tMs);
    this.gaze.push((lr + rr) / 2);
    this.dot.push(dotX);
  }

  private zscore(a: number[]): number[] {
    const m = mean(a);
    const s = std(a) || 1e-6;
    return a.map((v) => (v - m) / s);
  }

  snapshot(): FeatureBag {
    const n = this.gaze.length;
    const missed = this.frames ? 1 - this.goodFrames / this.frames : 1;
    if (n < 16) {
      return {
        tracking_lag: 0,
        tracking_smoothness: 0,
        missed_tracking_percentage: missed,
        eye_quality: clamp01((1 - missed) * 0.3),
      };
    }
    const durSec = (this.t[n - 1] - this.t[0]) / 1000 || 1;
    const fps = n / durSec;
    const g = this.zscore(this.gaze);
    const d = this.zscore(this.dot);

    // cross-correlation over lags 0..~0.8s; gaze may be inverted, so use |corr|
    const maxLag = Math.min(n - 4, Math.floor(fps * 0.8));
    let bestCorr = 0;
    let bestLag = 0;
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0;
      let cnt = 0;
      for (let i = 0; i + lag < n; i++) {
        s += g[i + lag] * d[i];
        cnt++;
      }
      const corr = cnt ? s / cnt : 0;
      if (Math.abs(corr) > Math.abs(bestCorr)) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    const smoothness = clamp01(Math.abs(bestCorr));
    const lagMs = (bestLag / fps) * 1000;
    const quality = clamp01((1 - missed) * (n >= 24 ? 1 : 0.5));

    return {
      tracking_lag: lagMs,
      tracking_smoothness: smoothness,
      missed_tracking_percentage: missed,
      eye_corr: bestCorr,
      eye_quality: quality,
    };
  }
}
