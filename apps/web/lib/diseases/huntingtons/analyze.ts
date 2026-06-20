import { buildResult, flag, tri } from "@/lib/detectors/util";
import type { AssessmentResult } from "@/lib/types";

export interface HuntingtonsInputs {
  // Genetic (optional)
  cagKnown: boolean;
  cagRepeat?: number;
  age: number;

  // Motor symptoms
  chorea: boolean;         // involuntary jerking movements
  balanceFalls: boolean;   // balance problems / falls
  gaitUnsteady: boolean;   // lurching/unsteady walk
  fineMotor: boolean;      // trouble with buttons, writing

  // Cognitive
  thinkingSlower: boolean;
  concentration: boolean;
  recentMemory: boolean;

  // Psychiatric
  moodChanges: boolean;    // depression, anxiety, irritability without clear cause
  behaviorChanges: boolean;

  // Family history
  parentSibling: boolean;  // parent or sibling with confirmed HD
  familyUnexplained: boolean; // unexplained movement disorder / early dementia in family
}

/** CAG-Age Product — validated risk stratifier for HD gene carriers. */
function capScore(age: number, cag: number): number {
  return (age * (cag - 33.66)) / 100;
}

export function analyzeHuntingtons(inputs: HuntingtonsInputs): AssessmentResult {
  const features: Record<string, number | boolean | string | null> = {
    age: inputs.age,
    cag_known: inputs.cagKnown,
    cag_repeat: inputs.cagKnown && inputs.cagRepeat != null ? inputs.cagRepeat : null,
    cap_score: inputs.cagKnown && inputs.cagRepeat != null
      ? Math.round(capScore(inputs.age, inputs.cagRepeat) * 10) / 10
      : null,
    chorea: inputs.chorea,
    balance_falls: inputs.balanceFalls,
    gait_unsteady: inputs.gaitUnsteady,
    fine_motor: inputs.fineMotor,
    thinking_slower: inputs.thinkingSlower,
    concentration: inputs.concentration,
    recent_memory: inputs.recentMemory,
    mood_changes: inputs.moodChanges,
    behavior_changes: inputs.behaviorChanges,
    family_parent_sibling: inputs.parentSibling,
    family_unexplained: inputs.familyUnexplained,
  };

  // ── CAP-based genetic risk flag ──────────────────────────────
  let capFlag = null;
  if (inputs.cagKnown && inputs.cagRepeat != null) {
    const cap = capScore(inputs.age, inputs.cagRepeat);
    const highGenetic = inputs.cagRepeat >= 36; // confirmed HD range
    const capHigh = cap > 60;
    const { detected, uncertain, confidence } = tri(
      highGenetic || capHigh,
      1.0,
    );
    capFlag = flag({
      id: "genetic_risk",
      label: "Genetic risk (CAG / CAP score)",
      detected,
      confidence: uncertain ? 0.2 : confidence,
      source: "user_report",
      explanation: highGenetic
        ? `CAG repeat ${inputs.cagRepeat} ≥ 36 — HD range. CAP = ${Math.round(cap * 10) / 10}.`
        : `CAP score ${Math.round(cap * 10) / 10} (${cap > 60 ? "high" : cap > 40 ? "medium" : "low"} risk).`,
    });
  }

  // ── Motor flag ───────────────────────────────────────────────
  const motorCount = [inputs.chorea, inputs.balanceFalls, inputs.gaitUnsteady, inputs.fineMotor]
    .filter(Boolean).length;
  const motorFlag = flag({
    id: "motor_symptoms",
    label: "Motor symptoms (chorea, gait, balance)",
    detected: motorCount >= 2,
    confidence: motorCount >= 3 ? 0.85 : motorCount === 2 ? 0.65 : 0.3,
    source: "user_report",
    explanation: motorCount === 0
      ? "No motor symptoms reported."
      : `${motorCount}/4 motor symptom(s): ${[
          inputs.chorea && "involuntary movements",
          inputs.balanceFalls && "balance/falls",
          inputs.gaitUnsteady && "unsteady gait",
          inputs.fineMotor && "fine motor difficulty",
        ].filter(Boolean).join(", ")}.`,
  });

  // ── Cognitive flag ───────────────────────────────────────────
  const cogCount = [inputs.thinkingSlower, inputs.concentration, inputs.recentMemory]
    .filter(Boolean).length;
  const cogFlag = flag({
    id: "cognitive_symptoms",
    label: "Cognitive decline",
    detected: cogCount >= 2,
    confidence: cogCount >= 2 ? 0.7 : 0.3,
    source: "user_report",
    explanation: cogCount === 0
      ? "No cognitive symptoms reported."
      : `${cogCount}/3 cognitive symptom(s) reported.`,
  });

  // ── Psychiatric flag ─────────────────────────────────────────
  const psychCount = [inputs.moodChanges, inputs.behaviorChanges].filter(Boolean).length;
  const psychFlag = flag({
    id: "psychiatric_symptoms",
    label: "Psychiatric / behavioral changes",
    detected: psychCount >= 1,
    confidence: psychCount >= 2 ? 0.65 : 0.45,
    source: "user_report",
    explanation: psychCount === 0
      ? "No psychiatric symptoms reported."
      : "Mood or behavioral changes reported (common early HD feature).",
  });

  // ── Family history flag ──────────────────────────────────────
  const familyFlag = flag({
    id: "family_history",
    label: "Family history of HD",
    detected: inputs.parentSibling || inputs.familyUnexplained,
    confidence: inputs.parentSibling ? 0.9 : inputs.familyUnexplained ? 0.6 : 0.1,
    source: "user_report",
    explanation: inputs.parentSibling
      ? "First-degree relative (parent/sibling) with confirmed HD — 50% inheritance risk."
      : inputs.familyUnexplained
      ? "Family history of unexplained movement disorder or early dementia."
      : "No family history reported.",
  });

  const redFlags = [
    ...(capFlag ? [capFlag] : []),
    motorFlag,
    cogFlag,
    psychFlag,
    familyFlag,
  ];

  // ── Severity score (weighted) ────────────────────────────────
  let score = 0;
  if (capFlag?.detected) score += 40;
  else if (inputs.cagKnown && inputs.cagRepeat != null) {
    const cap = capScore(inputs.age, inputs.cagRepeat);
    score += cap > 40 ? 20 : 5;
  }
  score += motorCount * 8;
  score += cogCount * 5;
  score += psychCount * 4;
  if (inputs.parentSibling) score += 15;
  else if (inputs.familyUnexplained) score += 7;
  score = Math.min(score, 100);

  const priority = score >= 60 ? "P1" : score >= 30 ? "P2" : "P3";

  const anyDetected = redFlags.some((f) => f.detected);
  const explanation = anyDetected
    ? `Multiple HD-associated features present (score ${score}/100). This is a screening tool only — not a diagnosis. Neurology referral warranted.`
    : `No strong HD indicators detected (score ${score}/100). Screening only.`;

  return buildResult({
    module: "huntingtons",
    priority,
    redFlags,
    features,
    explanation,
    severityScore: score,
    nextQuestions: anyDetected
      ? [
          "Have you had genetic testing for the HTT CAG repeat expansion?",
          "Has a neurologist evaluated your motor symptoms?",
          "Are any first-degree relatives currently under HD specialist care?",
        ]
      : [
          "Do you have a family history of Huntington's disease?",
          "Consider genetic counseling if a family member has HD.",
        ],
  });
}
