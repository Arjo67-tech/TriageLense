// ──────────────────────────────────────────────────────────
//  Pose-based extractors:
//    ArmDriftExtractor   → stroke arm step
//    BalanceExtractor    → concussion balance / heat steadiness
//    PostureExtractor    → respiratory tripod posture
//    BreathingExtractor  → respiratory breathing rate
// ──────────────────────────────────────────────────────────
import type { FeatureBag } from "../types";
import type { Landmark } from "../mediapipe/indices";
import { POSE } from "../mediapipe/indices";
import {
  clamp01,
  dist,
  dominantFrequency,
  findPeaks,
  mean,
  std,
  pathLength,
} from "./signal";

const vis = (l?: Landmark) => (l ? (l.visibility ?? 1) : 0) > 0.4;
const center = (a: Landmark, b: Landmark) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

// ── Arm drift (stroke) ─────────────────────────────────────
export class ArmDriftExtractor {
  private t: number[] = [];
  private lY: number[] = [];
  private rY: number[] = [];
  private torsoH: number[] = [];
  private frames = 0;
  private goodFrames = 0;

  reset() {
    this.t = [];
    this.lY = [];
    this.rY = [];
    this.torsoH = [];
    this.frames = 0;
    this.goodFrames = 0;
  }

  push(pose: Landmark[] | null, tMs: number) {
    this.frames++;
    if (!pose) return;
    const lw = pose[POSE.LEFT_WRIST];
    const rw = pose[POSE.RIGHT_WRIST];
    const ls = pose[POSE.LEFT_SHOULDER];
    const rs = pose[POSE.RIGHT_SHOULDER];
    const lh = pose[POSE.LEFT_HIP];
    const rh = pose[POSE.RIGHT_HIP];
    if (!vis(lw) || !vis(rw) || !vis(ls) || !vis(rs)) return;
    this.goodFrames++;
    const sc = center(ls, rs);
    const hc = vis(lh) && vis(rh) ? center(lh, rh) : { x: sc.x, y: sc.y + 0.3 };
    this.t.push(tMs);
    this.lY.push(lw.y);
    this.rY.push(rw.y);
    this.torsoH.push(Math.max(0.05, Math.hypot(sc.x - hc.x, sc.y - hc.y)));
  }

  private dropRate(ys: number[], torso: number): number {
    if (ys.length < 6) return 0;
    const k = Math.max(1, Math.floor(ys.length * 0.25));
    const first = mean(ys.slice(0, k));
    const last = mean(ys.slice(-k));
    return Math.max(0, (last - first) / torso); // y increases downward → drop
  }

  snapshot(): FeatureBag {
    const torso = this.torsoH.length ? mean(this.torsoH) : 0.3;
    const dropL = this.dropRate(this.lY, torso);
    const dropR = this.dropRate(this.rY, torso);
    const k = Math.max(1, Math.floor(this.lY.length * 0.25));
    const endL = this.lY.length ? mean(this.lY.slice(-k)) : 0;
    const endR = this.rY.length ? mean(this.rY.slice(-k)) : 0;
    const heightAsym = this.lY.length ? Math.abs(endL - endR) / torso : 0;
    const driftScore = clamp01(
      (Math.max(dropL, dropR) / 0.12) * 0.7 + (heightAsym / 0.12) * 0.3,
    );
    const visibility = this.frames ? this.goodFrames / this.frames : 0;
    const quality = this.goodFrames >= 8 ? clamp01(visibility) : clamp01(visibility * 0.4);
    return {
      arm_drift_score: driftScore,
      left_wrist_drop_rate: dropL,
      right_wrist_drop_rate: dropR,
      arm_height_asymmetry: heightAsym,
      pose_visible_ratio: visibility,
      pose_quality: quality,
    };
  }
}

// ── Balance / sway (concussion + heat) ─────────────────────
export class BalanceExtractor {
  private cx: number[] = [];
  private cy: number[] = [];
  private hx: number[] = []; // head x
  private hy: number[] = [];
  private hipx: number[] = [];
  private scale: number[] = [];
  private frames = 0;
  private goodFrames = 0;

  reset() {
    this.cx = [];
    this.cy = [];
    this.hx = [];
    this.hy = [];
    this.hipx = [];
    this.scale = [];
    this.frames = 0;
    this.goodFrames = 0;
  }

  push(pose: Landmark[] | null) {
    this.frames++;
    if (!pose) return;
    const ls = pose[POSE.LEFT_SHOULDER];
    const rs = pose[POSE.RIGHT_SHOULDER];
    const lh = pose[POSE.LEFT_HIP];
    const rh = pose[POSE.RIGHT_HIP];
    const nose = pose[POSE.NOSE];
    if (!vis(ls) || !vis(rs) || !vis(lh) || !vis(rh) || !vis(nose)) return;
    this.goodFrames++;
    const sw = Math.max(0.05, dist(ls, rs));
    const sc = center(ls, rs);
    const hc = center(lh, rh);
    const bc = { x: (sc.x + hc.x) / 2, y: (sc.y + hc.y) / 2 };
    this.cx.push(bc.x);
    this.cy.push(bc.y);
    this.hx.push(nose.x);
    this.hy.push(nose.y);
    this.hipx.push(hc.x);
    this.scale.push(sw);
  }

  snapshot(): FeatureBag {
    const sw = this.scale.length ? mean(this.scale) : 0.2;
    const pts = this.cx.map((x, i) => ({ x, y: this.cy[i] }));
    const swayPath = pts.length > 2 ? pathLength(pts) / sw : 0;
    const lateral = this.cx.length ? std(this.cx) / sw : 0;
    const headStd = this.hx.length ? (std(this.hx) + std(this.hy)) / 2 / sw : 0;
    const hipStd = this.hipx.length ? std(this.hipx) / sw : 0;
    const weakness = clamp01((lateral / 0.04) * 0.5 + (headStd / 0.02) * 0.5);
    const visibility = this.frames ? this.goodFrames / this.frames : 0;
    const quality = this.goodFrames >= 10 ? clamp01(visibility) : clamp01(visibility * 0.4);
    return {
      sway_path_length: swayPath,
      lateral_sway: lateral,
      head_sway_std: headStd,
      hip_sway_std: hipStd,
      weakness_unsteady_score: weakness,
      balance_quality: quality,
      pose_quality: quality,
    };
  }
}

// ── Posture / tripod (respiratory) ─────────────────────────
export class PostureExtractor {
  private lean: number[] = [];
  private tripod: number[] = [];
  private frames = 0;
  private goodFrames = 0;

  reset() {
    this.lean = [];
    this.tripod = [];
    this.frames = 0;
    this.goodFrames = 0;
  }

  push(pose: Landmark[] | null) {
    this.frames++;
    if (!pose) return;
    const ls = pose[POSE.LEFT_SHOULDER];
    const rs = pose[POSE.RIGHT_SHOULDER];
    const lh = pose[POSE.LEFT_HIP];
    const rh = pose[POSE.RIGHT_HIP];
    if (!vis(ls) || !vis(rs) || !vis(lh) || !vis(rh)) return;
    this.goodFrames++;
    const sc = center(ls, rs);
    const hc = center(lh, rh);
    const torsoH = Math.max(0.05, Math.hypot(sc.x - hc.x, sc.y - hc.y));
    // angle of torso from vertical (0° = upright)
    const dx = sc.x - hc.x;
    const dy = hc.y - sc.y; // positive when shoulders above hips
    const leanDeg = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
    this.lean.push(leanDeg);

    // hands-near-knees component (only if knees visible)
    const lw = pose[POSE.LEFT_WRIST];
    const rw = pose[POSE.RIGHT_WRIST];
    const lk = pose[POSE.LEFT_KNEE];
    const rk = pose[POSE.RIGHT_KNEE];
    let handsOnKnees = 0;
    if (vis(lw) && vis(lk)) handsOnKnees += dist(lw, lk) / torsoH < 0.6 ? 0.5 : 0;
    if (vis(rw) && vis(rk)) handsOnKnees += dist(rw, rk) / torsoH < 0.6 ? 0.5 : 0;
    const leanComp = clamp01(leanDeg / 35);
    this.tripod.push(clamp01(leanComp * 0.6 + handsOnKnees * 0.4));
  }

  snapshot(): FeatureBag {
    const lean = this.lean.length ? mean(this.lean) : 0;
    const tripod = this.tripod.length ? mean(this.tripod) : 0;
    const visibility = this.frames ? this.goodFrames / this.frames : 0;
    const quality = this.goodFrames >= 5 ? clamp01(visibility) : clamp01(visibility * 0.4);
    return {
      forward_lean_angle: lean,
      tripod_posture_score: tripod,
      pose_quality: quality,
    };
  }
}

// ── Breathing rate (respiratory) ───────────────────────────
export class BreathingExtractor {
  private t: number[] = [];
  private y: number[] = []; // shoulder-center vertical position
  private amp: number[] = []; // chest opening proxy
  private frames = 0;
  private goodFrames = 0;

  reset() {
    this.t = [];
    this.y = [];
    this.amp = [];
    this.frames = 0;
    this.goodFrames = 0;
  }

  push(pose: Landmark[] | null, tMs: number) {
    this.frames++;
    if (!pose) return;
    const ls = pose[POSE.LEFT_SHOULDER];
    const rs = pose[POSE.RIGHT_SHOULDER];
    if (!vis(ls) || !vis(rs)) return;
    this.goodFrames++;
    const sc = center(ls, rs);
    this.t.push(tMs);
    this.y.push(sc.y);
    this.amp.push(dist(ls, rs)); // shoulder width breathes slightly
  }

  snapshot(): FeatureBag {
    const n = this.y.length;
    if (n < 12) {
      return {
        estimated_breaths_per_minute: 0,
        breathing_signal_quality: 0,
        breathing_irregularity: 0,
        breathing_samples: n,
      };
    }
    const durSec = (this.t[n - 1] - this.t[0]) / 1000 || 1;
    const fps = n / durSec;

    // detrend the vertical signal and find its dominant frequency 0.1–0.7 Hz
    const { freq, power } = dominantFrequency(this.y, fps, [0.1, 0.7]);
    const bpm = freq * 60;

    // irregularity from inter-peak interval variation
    const sigStd = std(this.y) || 1e-6;
    const peaks = findPeaks(this.y, sigStd * 0.6, Math.max(2, Math.floor(fps * 0.6)));
    let irregularity = 0;
    if (peaks.length >= 3) {
      const intervals: number[] = [];
      for (let i = 1; i < peaks.length; i++)
        intervals.push((peaks[i] - peaks[i - 1]) / fps);
      const m = mean(intervals);
      irregularity = m > 0 ? clamp01(std(intervals) / m) : 0;
    }

    // quality: need enough oscillation power, enough duration, visible torso
    const visibility = this.frames ? this.goodFrames / this.frames : 0;
    const durFactor = clamp01(durSec / 20);
    const powerFactor = clamp01(power / 0.15);
    const quality = clamp01(visibility * 0.4 + durFactor * 0.3 + powerFactor * 0.3);

    return {
      estimated_breaths_per_minute: bpm,
      breathing_signal_quality: quality,
      breathing_irregularity: irregularity,
      breathing_frequency_hz: freq,
      breathing_power: power,
      breathing_samples: n,
      breathing_fps: fps,
    };
  }
}
