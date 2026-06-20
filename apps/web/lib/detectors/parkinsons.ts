// ──────────────────────────────────────────────────────────
//  Parkinsonian movement judgment.
//  Reads finger-tapping + postural-tremor features (MediaPipe Hands).
// ──────────────────────────────────────────────────────────
import type { AssessmentResult, FeatureBag, RedFlag, UserInputs } from "../types";
import { buildResult, flag, num, tri } from "./util";

export const PD_TH = {
  slowTapHz: 2.5, // below this = bradykinetic tapping
  reducedAmp: 0.06, // normalized thumb-index amplitude
  irregularCV: 0.4, // coefficient of variation of tap intervals
  amplitudeDecay: 0.3, // fractional decrement across the trial
  asymmetry: 0.4, // relative L/R difference
  tremorScore: 0.5, // 0..1 oscillation energy
  tremorBand: [3, 7] as [number, number], // Hz
};

function handFlags(
  features: FeatureBag,
  side: "left" | "right",
): { flags: RedFlag[]; quality: number } {
  const q = num(features, `${side}_tap_quality`) ?? 0;
  const freq = num(features, `${side}_tap_frequency_hz`);
  const amp = num(features, `${side}_mean_tap_amplitude`);
  const cv = num(features, `${side}_tap_interval_variability`);
  const decay = num(features, `${side}_amplitude_decay`);

  const flags: RedFlag[] = [];
  const slowed = tri((freq ?? 99) < PD_TH.slowTapHz, q);
  flags.push(
    flag({
      id: `${side}_slowed_tapping`,
      label: `Slowed tapping (${side})`,
      detected: slowed.detected,
      confidence: slowed.confidence,
      source: "camera",
      explanation: slowed.uncertain
        ? `${side} hand not tracked well enough to judge tap speed (uncertain).`
        : `${side} tap frequency = ${(freq ?? 0).toFixed(2)} Hz (threshold ${PD_TH.slowTapHz}).`,
    }),
  );
  const reduced = tri((amp ?? 1) < PD_TH.reducedAmp, q);
  flags.push(
    flag({
      id: `${side}_reduced_amplitude`,
      label: `Reduced amplitude (${side})`,
      detected: reduced.detected,
      confidence: reduced.confidence,
      source: "camera",
      explanation: reduced.uncertain
        ? `${side} hand amplitude not measurable (uncertain).`
        : `${side} mean amplitude = ${(amp ?? 0).toFixed(3)} (threshold ${PD_TH.reducedAmp}).`,
    }),
  );
  const irregular = tri((cv ?? 0) > PD_TH.irregularCV, q);
  flags.push(
    flag({
      id: `${side}_irregular_tapping`,
      label: `Irregular rhythm (${side})`,
      detected: irregular.detected,
      confidence: irregular.confidence,
      source: "camera",
      explanation: irregular.uncertain
        ? `${side} rhythm not measurable (uncertain).`
        : `${side} interval variability (CV) = ${(cv ?? 0).toFixed(2)} (threshold ${PD_TH.irregularCV}).`,
    }),
  );
  const decayF = tri((decay ?? 0) > PD_TH.amplitudeDecay, q);
  flags.push(
    flag({
      id: `${side}_amplitude_decay`,
      label: `Amplitude decay (${side})`,
      detected: decayF.detected,
      confidence: decayF.confidence,
      source: "camera",
      explanation: decayF.uncertain
        ? `${side} decay not measurable (uncertain).`
        : `${side} amplitude decay = ${(decay ?? 0).toFixed(2)} (threshold ${PD_TH.amplitudeDecay}).`,
    }),
  );
  return { flags, quality: q };
}

export function analyzeParkinsons(
  features: FeatureBag,
  _userInputs: UserInputs = {},
): AssessmentResult {
  const right = handFlags(features, "right");
  const left = handFlags(features, "left");
  const redFlags: RedFlag[] = [...right.flags, ...left.flags];

  // ── Left/right asymmetry ─────────────────────────────
  const asym = num(features, "tap_left_right_asymmetry");
  const asymQ = Math.min(right.quality, left.quality);
  const asymJ = tri((asym ?? 0) > PD_TH.asymmetry, asymQ);
  redFlags.push(
    flag({
      id: "left_right_asymmetry",
      label: "Left/right asymmetry",
      detected: asymJ.detected,
      confidence: asymJ.confidence,
      source: "camera",
      explanation: asymJ.uncertain
        ? "Both hands were not measured well enough to compare (uncertain)."
        : `Relative L/R difference = ${(asym ?? 0).toFixed(2)} (threshold ${PD_TH.asymmetry}).`,
    }),
  );

  // ── Tremor ───────────────────────────────────────────
  const tremorQ = num(features, "tremor_quality") ?? 0;
  const tremorScore = num(features, "tremor_like_motion_score");
  const tremorFreq = num(features, "tremor_frequency_hz");
  const inBand =
    tremorFreq !== undefined &&
    tremorFreq >= PD_TH.tremorBand[0] &&
    tremorFreq <= PD_TH.tremorBand[1];
  const tremorPresent = (tremorScore ?? 0) > PD_TH.tremorScore;
  const tremorJ = tri(tremorPresent, tremorQ);
  redFlags.push(
    flag({
      id: "tremor_like_motion",
      label: "Tremor-like motion",
      detected: tremorJ.detected,
      confidence: tremorJ.confidence,
      source: "camera",
      explanation: tremorJ.uncertain
        ? "Hands not held still in view long enough to assess tremor (uncertain)."
        : tremorPresent
          ? `Oscillation score=${(tremorScore ?? 0).toFixed(2)} at ~${(tremorFreq ?? 0).toFixed(1)} Hz${inBand ? " (within 3–7 Hz tremor band)" : ""}.`
          : `Hands steady (score=${(tremorScore ?? 0).toFixed(2)}).`,
    }),
  );

  // ── Roll-up ──────────────────────────────────────────
  const decided = redFlags.filter(
    (f) => f.confidence >= 0.35, // had usable quality
  );
  const positives = decided.filter((f) => f.detected).length;
  const allUncertain =
    right.quality < 0.35 && left.quality < 0.35 && tremorQ < 0.35;

  let priority: AssessmentResult["priority"];
  let explanation: string;
  if (positives >= 2) {
    priority = "P2";
    explanation =
      "Multiple parkinsonian movement markers detected. This is not an emergency, but warrants a neurology evaluation.";
  } else if (positives === 1) {
    priority = "P3";
    explanation =
      "One movement marker detected. Consider follow-up if it persists; isolated findings are often benign.";
  } else if (allUncertain) {
    priority = "P3";
    explanation =
      "Hands could not be tracked reliably — movement markers are uncertain, not normal. Retry with better lighting and both hands in frame.";
  } else {
    priority = "P3";
    explanation = "No parkinsonian movement markers detected in this screen.";
  }

  return buildResult({
    module: "parkinsons",
    priority,
    redFlags,
    features,
    explanation,
    uncertain: allUncertain,
    nextQuestions: [
      "Have you noticed a tremor at rest, or stiffness/slowness in daily tasks?",
      "Is one side affected more than the other?",
      "Any change in handwriting size or facial expression?",
    ],
  });
}
