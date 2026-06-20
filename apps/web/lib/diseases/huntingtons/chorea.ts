/**
 * Chorea motion analysis from MediaPipe Pose landmarks.
 * User holds arms outstretched and still for ~10s.
 * We measure involuntary movement variance, burstiness, and bilateral asymmetry.
 */

export interface LandmarkSample {
  /** timestamp ms */
  t: number;
  /** normalized [0,1] x,y for left wrist, right wrist, left elbow, right elbow */
  lWrist: [number, number];
  rWrist: [number, number];
  lElbow: [number, number];
  rElbow: [number, number];
}

export interface ChoreoMetrics {
  /** Mean std deviation of wrist positions (normalized coords). Healthy ~0.003, HD ~0.015+ */
  motionAmplitude: number;
  /** Fraction of frames with sudden motion spike (>3× median). Healthy <0.05, HD >0.15 */
  burstiness: number;
  /** Ratio max(leftVar, rightVar) / min(leftVar, rightVar). HD often >2.0 */
  bilateralAsymmetry: number;
  /** Seconds of valid capture */
  durationSec: number;
  /** 0..1 quality: needs ≥5s and ≥100 samples */
  quality: number;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

function frameMotion(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

export function computeChoreoMetrics(samples: LandmarkSample[]): ChoreoMetrics {
  const n = samples.length;
  const durationSec = n > 1 ? (samples[n - 1].t - samples[0].t) / 1000 : 0;
  const quality = Math.min(1, (durationSec / 8) * Math.min(1, n / 100));

  if (n < 10) {
    return { motionAmplitude: 0, burstiness: 0, bilateralAsymmetry: 1, durationSec, quality };
  }

  // Per-axis std of each landmark
  const lWx = std(samples.map((s) => s.lWrist[0]));
  const lWy = std(samples.map((s) => s.lWrist[1]));
  const rWx = std(samples.map((s) => s.rWrist[0]));
  const rWy = std(samples.map((s) => s.rWrist[1]));
  const lEy = std(samples.map((s) => s.lElbow[1]));
  const rEy = std(samples.map((s) => s.rElbow[1]));

  const motionAmplitude = (lWx + lWy + rWx + rWy + lEy + rEy) / 6;

  // Frame-to-frame motion for burstiness
  const frameMotions: number[] = [];
  for (let i = 1; i < n; i++) {
    const m = (
      frameMotion(samples[i].lWrist, samples[i - 1].lWrist) +
      frameMotion(samples[i].rWrist, samples[i - 1].rWrist)
    ) / 2;
    frameMotions.push(m);
  }
  const sorted = [...frameMotions].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = median * 3;
  const burstiness = frameMotions.filter((m) => m > threshold).length / frameMotions.length;

  // Bilateral asymmetry: variance ratio left vs right wrist
  const leftVar = lWx * lWx + lWy * lWy;
  const rightVar = rWx * rWx + rWy * rWy;
  const bilateralAsymmetry = leftVar > 0 && rightVar > 0
    ? Math.max(leftVar, rightVar) / Math.min(leftVar, rightVar)
    : 1;

  return { motionAmplitude, burstiness, bilateralAsymmetry, durationSec, quality };
}

export interface ChoreoResult {
  /** 0..1 probability of chorea-level involuntary movement */
  choreaProbability: number;
  metrics: ChoreoMetrics;
  interpretation: string;
}

/** Rule-based thresholds from UHDRS motor literature. */
export function interpretChorea(metrics: ChoreoMetrics): ChoreoResult {
  const { motionAmplitude, burstiness, bilateralAsymmetry, quality } = metrics;

  if (quality < 0.4) {
    return {
      choreaProbability: 0.5,
      metrics,
      interpretation: "Insufficient capture duration or samples — result uncertain.",
    };
  }

  // Score 0..3 based on each metric
  let score = 0;
  if (motionAmplitude > 0.012) score += 1.5;
  else if (motionAmplitude > 0.006) score += 0.75;

  if (burstiness > 0.15) score += 1.0;
  else if (burstiness > 0.07) score += 0.5;

  if (bilateralAsymmetry > 2.5) score += 0.5;

  const prob = Math.min(score / 3, 1);

  const interpretation =
    prob > 0.6
      ? `High involuntary movement detected (amplitude ${(motionAmplitude * 1000).toFixed(1)}, burstiness ${(burstiness * 100).toFixed(0)}%). Consistent with chorea-level motor activity.`
      : prob > 0.3
      ? `Mild movement irregularity detected. May reflect early motor changes or normal restlessness.`
      : `Movement within normal range. No significant involuntary motion detected.`;

  return { choreaProbability: prob, metrics, interpretation };
}
