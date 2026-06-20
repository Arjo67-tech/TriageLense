// ──────────────────────────────────────────────────────────
//  Heat-illness judgment.
//  Combines heat-exposure/symptom context with LIVE confusion,
//  speech and steadiness checks — not a questionnaire alone.
// ──────────────────────────────────────────────────────────
import type { AssessmentResult, FeatureBag, RedFlag, UserInputs } from "../types";
import { buildResult, flag, num, reported, tri } from "./util";

export const HEAT_TH = {
  confusionScore: 0.5,
  orientationLatencyMs: 5000,
  answerPresence: 0.5,
  speechSimilarity: 0.6,
  phraseCompletion: 0.7,
  weaknessScore: 0.5, // 0..1 instability from pose
};

function bodyTempVeryHigh(t: number | undefined): boolean {
  if (t === undefined) return false;
  // accept Celsius (>=40) or Fahrenheit (>=104)
  if (t >= 50) return t >= 104; // looks like Fahrenheit
  return t >= 40; // Celsius
}

export function analyzeHeat(
  features: FeatureBag,
  userInputs: UserInputs = {},
): AssessmentResult {
  const redFlags: RedFlag[] = [];

  // ── Context / exposure ───────────────────────────────
  const heatExposure =
    reported(userInputs.heat_exposure) ||
    reported(userInputs.outdoor_activity) ||
    reported(userInputs.exertion) ||
    reported(userInputs.hot_environment);
  redFlags.push(
    flag({
      id: "heat_exposure_confirmed",
      label: "Heat exposure",
      detected: heatExposure,
      confidence: heatExposure ? 0.9 : 0.6,
      source: "user_report",
      explanation: heatExposure
        ? "User reports heat exposure / exertion / hot environment."
        : "No heat exposure reported.",
    }),
  );

  const collapse = reported(userInputs.collapse_fainting);
  const seizure = reported(userInputs.seizure);
  const dizziness = reported(userInputs.dizziness);
  const notSweating = reported(userInputs.not_sweating);
  const sweating = reported(userInputs.sweating_heavily);
  const bodyTemp = num(userInputs as FeatureBag, "body_temp");
  const tempHigh = bodyTempVeryHigh(bodyTemp);

  if (collapse)
    redFlags.push(
      flag({ id: "collapse_or_fainting_reported", label: "Collapse / fainting", detected: true, confidence: 0.95, source: "user_report", explanation: "User reports collapse or fainting." }),
    );
  if (seizure)
    redFlags.push(
      flag({ id: "seizure_reported", label: "Seizure", detected: true, confidence: 0.95, source: "user_report", explanation: "User reports a seizure." }),
    );
  if (tempHigh)
    redFlags.push(
      flag({ id: "high_body_temp", label: "Very high body temperature", detected: true, confidence: 0.9, source: "user_report", explanation: `Reported temperature ${bodyTemp} is in the heat-stroke range.` }),
    );
  if (notSweating && heatExposure)
    redFlags.push(
      flag({ id: "anhidrosis", label: "Not sweating despite heat", detected: true, confidence: 0.7, source: "user_report", explanation: "Absence of sweating in heat can indicate heat stroke." }),
    );

  // ── Live confusion ───────────────────────────────────
  const orientQ = num(features, "orientation_quality") ?? 0;
  const confusionScore = num(features, "orientation_confusion_score");
  const orientLatency = num(features, "orientation_response_latency");
  const answerPresence = num(features, "orientation_answer_presence");
  const confusionAbnormal =
    (confusionScore ?? 0) > HEAT_TH.confusionScore ||
    (orientLatency ?? 0) > HEAT_TH.orientationLatencyMs ||
    (answerPresence ?? 1) < HEAT_TH.answerPresence;
  const confusionJ = tri(confusionAbnormal, orientQ);
  redFlags.push(
    flag({
      id: "confusion_detected",
      label: "Confusion / altered mental status",
      detected: confusionJ.detected,
      confidence: confusionJ.confidence,
      source: "user_report",
      explanation: confusionJ.uncertain
        ? "Orientation not assessed (uncertain)."
        : confusionAbnormal
          ? `Confusion score=${(confusionScore ?? 0).toFixed(2)}, latency=${orientLatency ?? "?"}ms.`
          : "Mentally clear and oriented.",
    }),
  );

  // ── Live speech ──────────────────────────────────────
  const speechQ = num(features, "speech_quality") ?? 0;
  const sim = num(features, "speech_similarity_score");
  const completion = num(features, "phrase_completion");
  const speechAbnormal =
    (sim ?? 1) < HEAT_TH.speechSimilarity ||
    (completion ?? 1) < HEAT_TH.phraseCompletion;
  const speechJ = tri(speechAbnormal, speechQ);
  redFlags.push(
    flag({
      id: "speech_abnormality_detected",
      label: "Slurred / abnormal speech",
      detected: speechJ.detected,
      confidence: speechJ.confidence,
      source: "audio",
      explanation: speechJ.uncertain
        ? "Speech not captured (uncertain)."
        : speechAbnormal
          ? `Phrase incomplete/incorrect: similarity=${(sim ?? 0).toFixed(2)}, completion=${(completion ?? 0).toFixed(2)}.`
          : "Speech clear and complete.",
    }),
  );

  // ── Live weakness / instability ──────────────────────
  const poseQ = num(features, "pose_quality") ?? 0;
  const weakness = num(features, "weakness_unsteady_score");
  const weaknessAbnormal = (weakness ?? 0) > HEAT_TH.weaknessScore;
  const weaknessJ = tri(weaknessAbnormal, poseQ);
  redFlags.push(
    flag({
      id: "weakness_unsteady",
      label: "Weakness / unsteadiness",
      detected: weaknessJ.detected,
      confidence: weaknessJ.confidence,
      source: "camera",
      explanation: weaknessJ.uncertain
        ? "Posture not visible enough to assess steadiness (uncertain)."
        : `Instability score=${(weakness ?? 0).toFixed(2)} (threshold ${HEAT_TH.weaknessScore}).`,
    }),
  );

  // ── Priority ─────────────────────────────────────────
  const confusion = !confusionJ.uncertain && confusionJ.detected;
  const speechBad = !speechJ.uncertain && speechJ.detected;
  const weak = !weaknessJ.uncertain && weaknessJ.detected;

  let priority: AssessmentResult["priority"];
  let explanation: string;

  const heatStroke =
    (heatExposure && (confusion || speechBad || tempHigh)) ||
    collapse ||
    seizure;

  if (heatStroke) {
    priority = "P1";
    explanation =
      "Heat exposure with altered mental status / abnormal speech / very high temperature, or collapse/seizure — treat as possible heat stroke. Cool aggressively and seek emergency care now.";
  } else if (heatExposure && dizziness && weak && sweating) {
    priority = "P2";
    explanation =
      "Heat exhaustion picture (dizzy, weak, sweating) with intact mental status. Move to a cool place, hydrate, and seek care if it worsens.";
  } else if (heatExposure && (dizziness || weak || sweating || notSweating)) {
    priority = "P2";
    explanation =
      "Heat exposure with symptoms but normal mental status — likely heat exhaustion. Rest, cool, hydrate, and monitor.";
  } else {
    priority = "P3";
    explanation = heatExposure
      ? "Heat exposure reported but no red flags detected. Stay cool and hydrated."
      : "No heat-illness red flags detected.";
  }

  const heatRedFlags = redFlags.some((f) => f.detected && f.id !== "heat_exposure_confirmed");

  return buildResult({
    module: "heat",
    priority,
    redFlags,
    features,
    explanation,
    uncertain: !heatRedFlags && orientQ < 0.35 && speechQ < 0.35 && poseQ < 0.35,
    nextQuestions: [
      "Is the person confused, very drowsy, or hard to rouse?",
      "Has the skin stopped sweating, or is it hot and dry?",
      "Do you know the body temperature?",
    ],
  });
}
