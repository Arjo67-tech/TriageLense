// ──────────────────────────────────────────────────────────
//  Concussion / head-injury judgment.
//  Live detectors (orientation, speech, balance-sway, eye-tracking)
//  combined with a user-reported danger-sign checklist.
// ──────────────────────────────────────────────────────────
import type { AssessmentResult, FeatureBag, RedFlag, UserInputs } from "../types";
import { buildResult, flag, num, reported, tri } from "./util";

export const CONC_TH = {
  confusionScore: 0.5,
  orientationLatencyMs: 5000,
  answerPresence: 0.5,
  speechSimilarity: 0.6,
  swayPathLength: 0.6, // normalized cumulative path of body center
  lateralSway: 0.04,
  headSwayStd: 0.02,
  hipSwayStd: 0.02,
  missedTrackingPct: 0.4,
  trackingLagMs: 400,
  trackingSmoothness: 0.4, // 0..1, lower = jerkier
};

// Danger signs that, if reported, are an automatic P1 (emergent) escalation.
const MAJOR_DANGER: { id: string; label: string }[] = [
  { id: "loss_of_consciousness", label: "Loss of consciousness" },
  { id: "seizure", label: "Seizure" },
  { id: "repeated_vomiting", label: "Repeated vomiting" },
  { id: "worsening_headache", label: "Worsening headache" },
  { id: "unequal_pupils", label: "Unequal pupils" },
  { id: "cannot_stay_awake", label: "Cannot wake / stay awake" },
  { id: "weakness_numbness", label: "Weakness or numbness" },
  { id: "worsening_confusion", label: "Worsening confusion" },
  { id: "unusual_behavior", label: "Unusual behavior" },
  { id: "neck_pain", label: "Neck pain" },
];

export function analyzeConcussion(
  features: FeatureBag,
  userInputs: UserInputs = {},
): AssessmentResult {
  const redFlags: RedFlag[] = [];

  // ── User-reported danger signs ───────────────────────
  const reportedDanger = MAJOR_DANGER.filter((d) => reported(userInputs[d.id]));
  for (const d of MAJOR_DANGER) {
    const on = reported(userInputs[d.id]);
    if (on) {
      redFlags.push(
        flag({
          id: d.id,
          label: d.label,
          detected: true,
          confidence: 0.95,
          source: "user_report",
          explanation: `Reported by user — recognized head-injury danger sign.`,
        }),
      );
    }
  }
  const majorDanger = reportedDanger.length > 0;

  // ── Orientation / confusion ──────────────────────────
  const orientQ = num(features, "orientation_quality") ?? 0;
  const confusionScore = num(features, "orientation_confusion_score");
  const orientLatency = num(features, "orientation_response_latency");
  const answerPresence = num(features, "orientation_answer_presence");
  const speechQ = num(features, "speech_quality") ?? 0;
  const sim = num(features, "speech_similarity_score");
  const delayed = num(features, "response_latency");

  const confusionAbnormal =
    (confusionScore ?? 0) > CONC_TH.confusionScore ||
    (orientLatency ?? 0) > CONC_TH.orientationLatencyMs ||
    (answerPresence ?? 1) < CONC_TH.answerPresence;
  const confusionJ = tri(confusionAbnormal, orientQ);
  redFlags.push(
    flag({
      id: "confusion_or_delayed_response",
      label: "Confusion / delayed orientation",
      detected: confusionJ.detected,
      confidence: confusionJ.confidence,
      source: "user_report",
      explanation: confusionJ.uncertain
        ? "Orientation questions were not answered enough to judge (uncertain)."
        : confusionAbnormal
          ? `Confusion score=${(confusionScore ?? 0).toFixed(2)}, latency=${orientLatency ?? "?"}ms, answers present=${((answerPresence ?? 0) * 100).toFixed(0)}%.`
          : `Oriented and responsive (confusion=${(confusionScore ?? 0).toFixed(2)}).`,
    }),
  );

  // ── Speech ───────────────────────────────────────────
  const speechAbnormal = (sim ?? 1) < CONC_TH.speechSimilarity;
  const speechJ = tri(speechAbnormal, speechQ);
  redFlags.push(
    flag({
      id: "speech_abnormality",
      label: "Speech abnormality",
      detected: speechJ.detected,
      confidence: speechJ.confidence,
      source: "audio",
      explanation: speechJ.uncertain
        ? "Speech not captured (uncertain)."
        : `Phrase similarity=${(sim ?? 0).toFixed(2)}, response latency=${delayed ?? "?"}ms.`,
    }),
  );

  // ── Balance / sway ───────────────────────────────────
  const balanceQ = num(features, "balance_quality") ?? 0;
  const swayPath = num(features, "sway_path_length");
  const lateral = num(features, "lateral_sway");
  const headStd = num(features, "head_sway_std");
  const hipStd = num(features, "hip_sway_std");
  const balanceAbnormal =
    (swayPath ?? 0) > CONC_TH.swayPathLength ||
    (lateral ?? 0) > CONC_TH.lateralSway ||
    (headStd ?? 0) > CONC_TH.headSwayStd ||
    (hipStd ?? 0) > CONC_TH.hipSwayStd;
  const balanceJ = tri(balanceAbnormal, balanceQ);
  redFlags.push(
    flag({
      id: "balance_concern",
      label: "Balance / sway concern",
      detected: balanceJ.detected,
      confidence: balanceJ.confidence,
      source: "camera",
      explanation: balanceJ.uncertain
        ? "Head/shoulder/hip not all visible — balance not assessed (uncertain)."
        : balanceAbnormal
          ? `Excess sway: path=${(swayPath ?? 0).toFixed(2)}, lateral=${(lateral ?? 0).toFixed(3)}, head σ=${(headStd ?? 0).toFixed(3)}.`
          : `Steady (sway path=${(swayPath ?? 0).toFixed(2)}).`,
    }),
  );

  // ── Eye tracking ─────────────────────────────────────
  const eyeQ = num(features, "eye_quality") ?? 0;
  const missed = num(features, "missed_tracking_percentage");
  const lag = num(features, "tracking_lag");
  const smooth = num(features, "tracking_smoothness");
  const eyeAbnormal =
    (missed ?? 0) > CONC_TH.missedTrackingPct ||
    (lag ?? 0) > CONC_TH.trackingLagMs ||
    (smooth ?? 1) < CONC_TH.trackingSmoothness;
  const eyeJ = tri(eyeAbnormal, eyeQ);
  redFlags.push(
    flag({
      id: "eye_tracking_concern",
      label: "Eye-tracking concern",
      detected: eyeJ.detected,
      confidence: eyeJ.confidence,
      source: "camera",
      explanation: eyeJ.uncertain
        ? "Eye/gaze could not be tracked reliably (uncertain)."
        : eyeAbnormal
          ? `Tracking poor: missed=${((missed ?? 0) * 100).toFixed(0)}%, lag=${lag ?? "?"}ms, smoothness=${(smooth ?? 0).toFixed(2)}.`
          : `Smooth pursuit (missed=${((missed ?? 0) * 100).toFixed(0)}%).`,
    }),
  );

  // ── Priority ─────────────────────────────────────────
  const liveJ = [confusionJ, speechJ, balanceJ, eyeJ];
  const livePositives = liveJ.filter((j) => !j.uncertain && j.detected).length;
  const allLiveUncertain = liveJ.every((j) => j.uncertain) && !majorDanger;

  let priority: AssessmentResult["priority"];
  let explanation: string;
  if (majorDanger) {
    priority = "P1";
    explanation = `Head-injury danger sign(s) reported (${reportedDanger
      .map((d) => d.label)
      .join(", ")}). Emergent — seek emergency care now.`;
  } else if (livePositives >= 2) {
    priority = "P1";
    explanation =
      "Multiple live concussion signs detected. Treat as emergent and seek care.";
  } else if (livePositives === 1) {
    priority = "P2";
    explanation =
      "One live concussion sign detected. Urgent evaluation recommended; do not return to activity.";
  } else if (allLiveUncertain) {
    priority = "P2";
    explanation =
      "Live concussion checks were uncertain (camera/answers insufficient). Do not assume normal after a head injury — get evaluated if any concern.";
  } else {
    priority = "P3";
    explanation =
      "No concussion danger signs detected, but monitor for worsening over 24–48h.";
  }

  return buildResult({
    module: "concussion",
    priority,
    redFlags,
    features,
    explanation,
    uncertain: allLiveUncertain,
    nextQuestions: [
      "Is the headache getting worse or is there repeated vomiting?",
      "Any trouble staying awake, or behaving unusually?",
      "Is there neck pain or weakness/numbness anywhere?",
    ],
  });
}
