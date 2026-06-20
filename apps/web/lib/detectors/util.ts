// ──────────────────────────────────────────────────────────
//  Detector helpers — shared, pure, no DOM access.
//  Keeps every analyzeX() honest about missing data.
// ──────────────────────────────────────────────────────────
import type {
  AssessmentResult,
  FeatureBag,
  FeatureValue,
  Priority,
  RedFlag,
  Status,
} from "../types";

/** Read a numeric feature; returns `undefined` (not 0) when absent/non-finite.
 *  Detectors MUST treat undefined as "unknown" — never as a normal value. */
export function num(f: FeatureBag, key: string): number | undefined {
  const v = f[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function bool(f: FeatureBag, key: string): boolean | undefined {
  const v = f[key];
  return typeof v === "boolean" ? v : undefined;
}

export function str(f: FeatureBag, key: string): string | undefined {
  const v = f[key];
  return typeof v === "string" ? v : undefined;
}

/** Truthiness for a user-reported checkbox/answer. */
export function reported(v: FeatureValue | undefined): boolean {
  return v === true || v === "true" || v === "yes" || v === 1;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

/** Priority is the *most urgent* of a set (P0 most urgent). */
export function mostUrgent(a: Priority, b: Priority): Priority {
  const rank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return rank[a] <= rank[b] ? a : b;
}

export function highestPriority(ps: Priority[]): Priority {
  return ps.reduce(mostUrgent, "P3");
}

/** A three-way detected flag: true / false / uncertain.
 *  `quality` below `minQuality` forces uncertain regardless of value. */
export function tri(
  value: boolean,
  quality: number,
  minQuality = 0.35,
): { detected: boolean; uncertain: boolean; confidence: number } {
  if (!Number.isFinite(quality) || quality < minQuality) {
    return { detected: false, uncertain: true, confidence: clamp01(quality) };
  }
  return { detected: value, uncertain: false, confidence: clamp01(quality) };
}

export function flag(
  partial: Omit<RedFlag, "confidence"> & { confidence?: number },
): RedFlag {
  return { confidence: 0.5, ...partial };
}

/** Roll a set of red flags + a base priority into a final result.
 *  - status is "uncertain" if any *decisive* signal is uncertain and nothing
 *    abnormal was confirmed; "abnormal" if any flag detected; else "normal".
 *  - confidence is the mean of contributing flag confidences. */
export function buildResult(args: {
  module: string;
  priority: Priority;
  redFlags: RedFlag[];
  features: FeatureBag;
  explanation: string;
  nextQuestions?: string[];
  severityScore?: number;
  /** flags whose uncertainty should make the whole result uncertain */
  uncertain?: boolean;
}): AssessmentResult {
  const { redFlags } = args;
  const anyDetected = redFlags.some((f) => f.detected);
  let status: Status;
  if (anyDetected) status = "abnormal";
  else if (args.uncertain) status = "uncertain";
  else status = "normal";

  const confs = redFlags.map((f) => f.confidence).filter(Number.isFinite);
  const confidence = confs.length
    ? clamp01(confs.reduce((a, b) => a + b, 0) / confs.length)
    : args.uncertain
      ? 0.2
      : 0.5;

  const severityScore =
    args.severityScore ??
    Math.round(
      clamp01(
        redFlags.reduce((a, f) => a + (f.detected ? f.confidence : 0), 0) /
          Math.max(1, redFlags.length),
      ) * 100,
    );

  return {
    module: args.module,
    priority: args.priority,
    severityScore,
    confidence,
    status,
    redFlags,
    features: args.features,
    explanation: args.explanation,
    nextQuestions: args.nextQuestions ?? [],
  };
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
