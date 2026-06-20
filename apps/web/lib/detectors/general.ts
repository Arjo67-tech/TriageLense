// ──────────────────────────────────────────────────────────
//  General triage.
//  Runs MINI versions of the real detectors (same functions, not
//  duplicated logic), then routes to the most urgent module.
// ──────────────────────────────────────────────────────────
import type {
  AssessmentResult,
  FeatureBag,
  ModuleId,
  RedFlag,
  UserInputs,
} from "../types";
import { buildResult, flag, num, reported } from "./util";
import { combineResults } from "./priority";
import { analyzeStroke } from "./stroke";
import { analyzeRespiratory } from "./respiratory";
import { analyzeHeat } from "./heat";
import { analyzeConcussion } from "./concussion";
import { analyzeParkinsons } from "./parkinsons";

export interface GeneralOutput extends AssessmentResult {
  /** sub-results from each real detector that was run */
  submodules: { module: ModuleId; result: AssessmentResult }[];
  recommendedModule: ModuleId;
}

export function analyzeGeneral(
  features: FeatureBag,
  userInputs: UserInputs = {},
): GeneralOutput {
  const subs: { module: ModuleId; result: AssessmentResult }[] = [];
  const redFlags: RedFlag[] = [];

  // ── 0) Conscious & breathing safety gate ─────────────
  const conscious = userInputs.conscious === undefined ? true : reported(userInputs.conscious);
  const breathingNormally =
    userInputs.breathing_normally === undefined ? true : reported(userInputs.breathing_normally);

  if (!conscious || !breathingNormally) {
    redFlags.push(
      flag({
        id: "unconscious_or_not_breathing",
        label: !conscious ? "Unresponsive" : "Not breathing normally",
        detected: true,
        confidence: 0.97,
        source: "user_report",
        explanation:
          "Immediate life threat reported in the safety check — this overrides all other findings.",
      }),
    );
    const result = buildResult({
      module: "general",
      priority: "P0",
      redFlags,
      features,
      explanation:
        "Unresponsive and/or not breathing normally. Call emergency services now and begin CPR/rescue breathing if trained.",
      nextQuestions: ["Is the person responsive?", "Are they breathing normally?"],
    });
    return {
      ...result,
      submodules: subs,
      recommendedModule: "respiratory",
    };
  }

  // ── 1) Stroke mini-screen (face / arms / speech) ─────
  subs.push({ module: "stroke", result: analyzeStroke(features, userInputs) });

  // ── 2) Respiratory mini-screen (breathing / sentence) ─
  subs.push({
    module: "respiratory",
    result: analyzeRespiratory(features, userInputs),
  });

  // ── 3) Heat (context + live speech/confusion if any) ──
  subs.push({ module: "heat", result: analyzeHeat(features, userInputs) });

  // ── 4) Concussion — only if a head injury is reported ─
  if (reported(userInputs.head_injury)) {
    subs.push({
      module: "concussion",
      result: analyzeConcussion(features, userInputs),
    });
  }

  // ── 5) Optional movement observation ─────────────────
  if (
    reported(userInputs.movement_concern) &&
    num(features, "right_tap_quality") !== undefined
  ) {
    subs.push({
      module: "parkinsons",
      result: analyzeParkinsons(features, userInputs),
    });
  }

  // ── Aggregate ────────────────────────────────────────
  const results = subs.map((s) => s.result);
  const { priority, worst } = combineResults(results);

  // Recommend the most-urgent module that actually found something.
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;
  const recommended =
    subs
      .slice()
      .sort((a, b) => rank[a.result.priority] - rank[b.result.priority])
      .find((s) => s.result.priority !== "P3")?.module ??
    (worst ? (worst.module as ModuleId) : "general");

  // Surface each submodule's detected flags as the general red-flag list.
  for (const s of subs) {
    for (const f of s.result.redFlags) {
      if (f.detected) {
        redFlags.push({
          ...f,
          id: `${s.module}:${f.id}`,
          label: `${f.label} (${s.module})`,
        });
      }
    }
  }

  const detectedCount = redFlags.filter((f) => f.detected).length;
  const explanation =
    priority === "P3"
      ? "No red flags detected across the mini-screens."
      : `Highest concern: ${recommended.toUpperCase()} (${priority}). ${
          worst?.explanation ?? ""
        }`;

  // next best questions = those from the recommended module
  const recSub = subs.find((s) => s.module === recommended);
  const nextQuestions = recSub?.result.nextQuestions ?? [
    "Any sudden severe symptoms (one-sided weakness, severe chest pain, trouble breathing)?",
  ];

  const result = buildResult({
    module: "general",
    priority,
    redFlags,
    features: {
      ...features,
      highest_priority_detected: priority,
      likely_recommended_module: recommended,
      detected_red_flags: detectedCount,
    },
    explanation,
    nextQuestions,
    uncertain: results.every((r) => r.status === "uncertain"),
  });

  return { ...result, submodules: subs, recommendedModule: recommended };
}
