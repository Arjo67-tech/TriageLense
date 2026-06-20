// ──────────────────────────────────────────────────────────
//  TriageLens — shared types
//  The AssessmentResult contract is the boundary between the
//  detector logic (pure functions) and the UI. Every detector
//  returns this shape; the UI never invents results.
// ──────────────────────────────────────────────────────────

export type Priority = "P0" | "P1" | "P2" | "P3";

export type ModuleId =
  | "stroke"
  | "parkinsons"
  | "concussion"
  | "heat"
  | "respiratory"
  | "general";

export type Status = "normal" | "abnormal" | "uncertain";

/** Where a red-flag judgment came from. "simulation" is reserved and must
 *  never be used for a live exam — it exists so the type can express demo data
 *  explicitly rather than silently faking a camera/audio source. */
export type FlagSource =
  | "camera"
  | "audio"
  | "user_report"
  | "rule"
  | "simulation";

export interface RedFlag {
  id: string;
  label: string;
  detected: boolean;
  /** 0..1 — how confident we are in THIS flag's detected/not-detected value. */
  confidence: number;
  source: FlagSource;
  explanation: string;
}

export type FeatureValue = number | string | boolean | null;

export interface AssessmentResult {
  module: string;
  priority: Priority;
  /** 0..100 — higher = more concerning. */
  severityScore: number;
  /** 0..1 — overall confidence in the result given signal quality. */
  confidence: number;
  status: Status;
  redFlags: RedFlag[];
  /** Raw numerical/boolean features the judgment was made from.
   *  Surfaced verbatim in the debug panel — this is the proof of liveness. */
  features: Record<string, FeatureValue>;
  explanation: string;
  nextQuestions: string[];
}

// ── User-reported inputs (checkboxes / typed answers) ──────
// One loose bag keyed by exam; detectors read what they need and
// treat anything missing as "unknown", never as "normal".
export interface UserInputs {
  [key: string]: boolean | number | string | undefined;
}

// ── Feature bags produced by the extractors ────────────────
// These are intentionally permissive Records so an extractor can add
// step-specific features without a type change cascading everywhere.
// Detectors read named keys defensively (see lib/detectors/util.ts).
export type FeatureBag = Record<string, FeatureValue>;

// ── A reading from a feature buffer with a quality flag ────
export interface Measured<T = number> {
  value: T;
  /** 0..1; below ~0.35 detectors should return "uncertain" rather than judge. */
  quality: number;
  /** number of samples that backed this measurement */
  samples: number;
}

// ── Step descriptor used by the UI to drive an exam ────────
export type StepKind =
  | "face" // face landmarker
  | "pose" // pose landmarker
  | "hands" // hands landmarker
  | "speech" // mic + speech recognition
  | "breathing" // pose torso motion over time
  | "questions" // user-reported checklist / orientation Q&A
  | "eye-tracking"; // moving dot + face/eye landmarks

export interface ExamStep {
  id: string;
  kind: StepKind;
  title: string;
  instruction: string;
  /** seconds of capture for time-based steps (breathing, tremor, drift). */
  durationSec?: number;
  /** speech prompt for speech/eye steps. */
  prompt?: string;
}

export interface ExamConfig {
  module: ModuleId;
  title: string;
  blurb: string;
  steps: ExamStep[];
}
