// ──────────────────────────────────────────────────────────
//  Respiratory-distress judgment.
//  Live breathing-rate (torso motion), full-sentence speech test,
//  and tripod-posture detection + user-reported red flags.
// ──────────────────────────────────────────────────────────
import type { AssessmentResult, FeatureBag, RedFlag, UserInputs } from "../types";
import { buildResult, flag, num, reported, tri } from "./util";

export const RESP_TH = {
  fastBpm: 22, // adult tachypnea
  slowBpm: 8,
  irregularity: 0.5, // 0..1
  tripodScore: 0.5,
  forwardLeanDeg: 35,
  completion: 0.85,
};

export function analyzeRespiratory(
  features: FeatureBag,
  userInputs: UserInputs = {},
): AssessmentResult {
  const redFlags: RedFlag[] = [];

  // ── User-reported emergencies / red flags ────────────
  const notBreathingNormally = reported(userInputs.not_breathing_normally);
  const unconscious = reported(userInputs.unconscious);
  const gasping = reported(userInputs.gasping);
  const choking = reported(userInputs.choking);
  const chestPain = reported(userInputs.chest_pain);
  const blueLips = reported(userInputs.blue_lips);
  const confusionReported = reported(userInputs.confusion);
  const asthma = reported(userInputs.asthma_allergic);
  const dizziness = reported(userInputs.dizziness);

  const reportPairs: [boolean, string, string][] = [
    [notBreathingNormally, "not_breathing_normally", "Not breathing normally"],
    [unconscious, "unconscious", "Unconscious / unresponsive"],
    [gasping, "gasping", "Gasping for air"],
    [choking, "choking", "Choking concern"],
    [chestPain, "chest_pain", "Chest pain"],
    [blueLips, "blue_lips", "Blue lips / face"],
    [confusionReported, "confusion", "Confusion"],
    [asthma, "asthma_allergic", "Asthma / allergic reaction"],
    [dizziness, "dizziness", "Dizziness"],
  ];
  for (const [on, id, label] of reportPairs) {
    if (on)
      redFlags.push(
        flag({ id, label, detected: true, confidence: 0.9, source: "user_report", explanation: `Reported by user.` }),
      );
  }

  // ── Breathing rate (live) ────────────────────────────
  const breathQ = num(features, "breathing_signal_quality") ?? 0;
  const bpm = num(features, "estimated_breaths_per_minute");
  const irregular = num(features, "breathing_irregularity");

  const fastJ = tri((bpm ?? 0) > RESP_TH.fastBpm, breathQ);
  redFlags.push(
    flag({
      id: "fast_breathing",
      label: "Fast breathing (tachypnea)",
      detected: fastJ.detected,
      confidence: fastJ.confidence,
      source: "camera",
      explanation: fastJ.uncertain
        ? "Breathing motion signal too weak to estimate rate (uncertain)."
        : `Estimated ${(bpm ?? 0).toFixed(0)} breaths/min (fast > ${RESP_TH.fastBpm}).`,
    }),
  );
  const slowJ = tri((bpm ?? 99) < RESP_TH.slowBpm, breathQ);
  redFlags.push(
    flag({
      id: "slow_breathing_concern",
      label: "Slow breathing",
      detected: slowJ.detected,
      confidence: slowJ.confidence,
      source: "camera",
      explanation: slowJ.uncertain
        ? "Breathing rate not measurable (uncertain)."
        : `Estimated ${(bpm ?? 0).toFixed(0)} breaths/min (slow < ${RESP_TH.slowBpm}).`,
    }),
  );
  const irregJ = tri((irregular ?? 0) > RESP_TH.irregularity, breathQ);
  redFlags.push(
    flag({
      id: "irregular_breathing",
      label: "Irregular breathing",
      detected: irregJ.detected,
      confidence: irregJ.confidence,
      source: "camera",
      explanation: irregJ.uncertain
        ? "Breathing rhythm not measurable (uncertain)."
        : `Irregularity index=${(irregular ?? 0).toFixed(2)} (threshold ${RESP_TH.irregularity}).`,
    }),
  );

  // ── Full-sentence test ───────────────────────────────
  const speechQ = num(features, "speech_quality") ?? 0;
  const completion = num(features, "phrase_completion");
  const pauses = num(features, "pause_count");
  const stopped = num(features, "stopped_mid_sentence"); // 1/0 from extractor
  const cannotSpeak =
    (completion ?? 1) < RESP_TH.completion ||
    (pauses ?? 0) >= 2 ||
    stopped === 1;
  const speakJ = tri(cannotSpeak, speechQ);
  redFlags.push(
    flag({
      id: "cannot_speak_full_sentence",
      label: "Cannot speak a full sentence",
      detected: speakJ.detected,
      confidence: speakJ.confidence,
      source: "audio",
      explanation: speakJ.uncertain
        ? "Sentence test not captured (uncertain)."
        : cannotSpeak
          ? `Sentence incomplete: completion=${(completion ?? 0).toFixed(2)}, pauses=${pauses ?? "?"}.`
          : "Completed the sentence in one breath.",
    }),
  );

  // ── Tripod / forward-lean posture ────────────────────
  const poseQ = num(features, "pose_quality") ?? 0;
  const tripod = num(features, "tripod_posture_score");
  const lean = num(features, "forward_lean_angle");
  const tripodAbnormal =
    (tripod ?? 0) > RESP_TH.tripodScore || (lean ?? 0) > RESP_TH.forwardLeanDeg;
  const tripodJ = tri(tripodAbnormal, poseQ);
  redFlags.push(
    flag({
      id: "tripod_posture_detected",
      label: "Tripod / forward-lean posture",
      detected: tripodJ.detected,
      confidence: tripodJ.confidence,
      source: "camera",
      explanation: tripodJ.uncertain
        ? "Posture not visible enough to assess (uncertain)."
        : `Tripod score=${(tripod ?? 0).toFixed(2)}, forward lean=${(lean ?? 0).toFixed(0)}°.`,
    }),
  );

  // ── Priority logic ───────────────────────────────────
  const fast = !fastJ.uncertain && fastJ.detected;
  const cannot = !speakJ.uncertain && speakJ.detected;
  const anyBreathingDifficulty =
    fast ||
    (!slowJ.uncertain && slowJ.detected) ||
    (!irregJ.uncertain && irregJ.detected) ||
    cannot ||
    (!tripodJ.uncertain && tripodJ.detected);

  let priority: AssessmentResult["priority"];
  let explanation: string;

  if (notBreathingNormally || (unconscious && anyBreathingDifficulty) || gasping || choking) {
    priority = "P0";
    explanation =
      "Airway/breathing emergency (not breathing normally, gasping, choking, or unresponsive with breathing trouble). Call emergency services and start basic life support if trained.";
  } else if (
    (cannot && fast) ||
    (chestPain && anyBreathingDifficulty) ||
    (blueLips && anyBreathingDifficulty) ||
    (confusionReported && anyBreathingDifficulty)
  ) {
    priority = "P1";
    explanation =
      "Severe respiratory distress signs. Seek emergency care immediately.";
  } else if (fast || cannot || (!tripodJ.uncertain && tripodJ.detected)) {
    priority = "P2";
    explanation =
      "Increased work of breathing but still able to speak. Urgent evaluation recommended.";
  } else if (breathQ < 0.35 && speechQ < 0.35 && poseQ < 0.35) {
    priority = "P2";
    explanation =
      "Could not assess breathing reliably (poor signal). Do not assume normal — escalate if the person looks distressed.";
  } else {
    priority = "P3";
    explanation = "No respiratory-distress red flags detected.";
  }

  const severe =
    priority === "P0" ||
    (chestPain && anyBreathingDifficulty) ||
    (blueLips && anyBreathingDifficulty);
  redFlags.push(
    flag({
      id: "severe_respiratory_red_flags_detected",
      label: "Severe respiratory red flags",
      detected: severe,
      confidence: severe ? 0.9 : 0.6,
      source: "rule",
      explanation: severe
        ? "Combination of signs indicates severe distress."
        : "No severe-distress combination present.",
    }),
  );

  return buildResult({
    module: "respiratory",
    priority,
    redFlags,
    features,
    explanation,
    uncertain: breathQ < 0.35 && speechQ < 0.35 && poseQ < 0.35,
    nextQuestions: [
      "Can the person speak in full sentences, or only a few words at a time?",
      "Are the lips or face turning blue/grey?",
      "Is there chest pain or a known asthma/allergy trigger?",
    ],
  });
}
