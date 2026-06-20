// ──────────────────────────────────────────────────────────
//  Stroke (FAST) judgment.
//  Reads live face / pose / speech features and decides:
//    face asymmetry · arm drift · speech abnormality.
// ──────────────────────────────────────────────────────────
import type { AssessmentResult, FeatureBag, RedFlag, UserInputs } from "../types";
import { bool, buildResult, flag, num, reported, tri } from "./util";

// Thresholds (named so they're tunable in one place).
export const STROKE_TH = {
  faceAsymmetry: 0.5, // 0..1 composite
  mouthCornerYDiff: 0.045, // normalized to face height
  smileActivationDiff: 0.35, // |left-right| blendshape diff
  armDriftScore: 0.5, // 0..1 composite
  wristDropRate: 0.08, // normalized vertical drop over the hold
  armHeightAsym: 0.12, // normalized L/R wrist height gap
  speechSimilarity: 0.6,
  phraseCompletion: 0.7,
  responseLatencyMs: 3000,
};

export function analyzeStroke(
  features: FeatureBag,
  userInputs: UserInputs = {},
): AssessmentResult {
  const redFlags: RedFlag[] = [];

  // ── FACE ─────────────────────────────────────────────
  const faceQ = num(features, "face_quality") ?? 0;
  const asym = num(features, "face_asymmetry_score");
  const mouthDiff = num(features, "mouth_corner_y_difference");
  const smileL = num(features, "smile_activation_left");
  const smileR = num(features, "smile_activation_right");
  const smileDiff =
    smileL !== undefined && smileR !== undefined
      ? Math.abs(smileL - smileR)
      : undefined;

  const faceAbnormal =
    (asym ?? 0) > STROKE_TH.faceAsymmetry ||
    (mouthDiff ?? 0) > STROKE_TH.mouthCornerYDiff ||
    (smileDiff ?? 0) > STROKE_TH.smileActivationDiff;
  const faceJ = tri(faceAbnormal, faceQ);
  redFlags.push(
    flag({
      id: "face_asymmetry",
      label: "Facial asymmetry / droop",
      detected: faceJ.detected,
      confidence: faceJ.confidence,
      source: "camera",
      explanation: faceJ.uncertain
        ? "Could not see the face clearly enough to judge symmetry (uncertain)."
        : faceAbnormal
          ? `Asymmetry detected: composite=${(asym ?? 0).toFixed(2)}, mouth-corner Δy=${(mouthDiff ?? 0).toFixed(3)}, smile L/R Δ=${(smileDiff ?? 0).toFixed(2)}.`
          : `Face moved symmetrically (composite=${(asym ?? 0).toFixed(2)}).`,
    }),
  );

  // ── ARMS ─────────────────────────────────────────────
  const poseQ = num(features, "pose_quality") ?? 0;
  const drift = num(features, "arm_drift_score");
  const dropL = num(features, "left_wrist_drop_rate");
  const dropR = num(features, "right_wrist_drop_rate");
  const heightAsym = num(features, "arm_height_asymmetry");
  const armAbnormal =
    (drift ?? 0) > STROKE_TH.armDriftScore ||
    (dropL ?? 0) > STROKE_TH.wristDropRate ||
    (dropR ?? 0) > STROKE_TH.wristDropRate ||
    (heightAsym ?? 0) > STROKE_TH.armHeightAsym;
  const armJ = tri(armAbnormal, poseQ);
  redFlags.push(
    flag({
      id: "arm_drift",
      label: "Arm drift / weakness",
      detected: armJ.detected,
      confidence: armJ.confidence,
      source: "camera",
      explanation: armJ.uncertain
        ? "Arms/pose not visible enough to judge drift (uncertain)."
        : armAbnormal
          ? `Drift detected: score=${(drift ?? 0).toFixed(2)}, drop L=${(dropL ?? 0).toFixed(3)} R=${(dropR ?? 0).toFixed(3)}, height asym=${(heightAsym ?? 0).toFixed(2)}.`
          : `Arms held level (drift=${(drift ?? 0).toFixed(2)}).`,
    }),
  );

  // ── SPEECH ───────────────────────────────────────────
  const speechQ = num(features, "speech_quality") ?? 0;
  const sim = num(features, "speech_similarity_score");
  const completion = num(features, "phrase_completion");
  const latency = num(features, "response_latency");
  const speechAbnormal =
    (sim ?? 1) < STROKE_TH.speechSimilarity ||
    (completion ?? 1) < STROKE_TH.phraseCompletion ||
    (latency ?? 0) > STROKE_TH.responseLatencyMs;
  const speechJ = tri(speechAbnormal, speechQ);
  redFlags.push(
    flag({
      id: "speech_abnormality",
      label: "Speech abnormality",
      detected: speechJ.detected,
      confidence: speechJ.confidence,
      source: "audio",
      explanation: speechJ.uncertain
        ? "Speech could not be captured/transcribed (uncertain)."
        : speechAbnormal
          ? `Speech off: similarity=${(sim ?? 0).toFixed(2)}, completion=${(completion ?? 0).toFixed(2)}, latency=${latency ?? "?"}ms.`
          : `Phrase repeated clearly (similarity=${(sim ?? 0).toFixed(2)}).`,
    }),
  );

  // User-reported sudden onset raises the stakes.
  const suddenOnset = reported(userInputs.sudden_onset);
  if (suddenOnset) {
    redFlags.push(
      flag({
        id: "sudden_onset",
        label: "Sudden onset reported",
        detected: true,
        confidence: 0.9,
        source: "user_report",
        explanation: "User reports symptoms began suddenly — time-critical for stroke.",
      }),
    );
  }

  // ── PRIORITY ─────────────────────────────────────────
  const positives = [faceJ, armJ, speechJ].filter(
    (j) => !j.uncertain && j.detected,
  ).length;
  const allUncertain = [faceJ, armJ, speechJ].every((j) => j.uncertain);

  let priority: AssessmentResult["priority"] = "P3";
  let explanation: string;
  if (positives >= 2 || (positives >= 1 && suddenOnset)) {
    priority = "P0";
    explanation =
      "Two or more FAST signs (or one plus sudden onset) — treat as possible acute stroke. Call emergency services immediately.";
  } else if (positives === 1) {
    priority = "P1";
    explanation =
      "One FAST sign detected. Stroke cannot be ruled out — seek emergency care now.";
  } else if (allUncertain) {
    priority = "P2";
    explanation =
      "Could not assess FAST signs reliably from the live stream. Do not assume normal — escalate if there is any clinical concern.";
  } else {
    priority = "P3";
    explanation = "No FAST stroke signs detected in this screen.";
  }

  return buildResult({
    module: "stroke",
    priority,
    redFlags,
    features,
    explanation,
    uncertain: allUncertain,
    nextQuestions: [
      "When exactly did the symptoms start (last known well)?",
      "Any weakness or numbness on one side of the body?",
      "Any sudden vision loss, severe headache, or trouble understanding speech?",
    ],
  });
}
