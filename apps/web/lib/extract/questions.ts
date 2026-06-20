// ──────────────────────────────────────────────────────────
//  Orientation Q&A → confusion features.
//  Where possible, answers are checked against the device clock
//  (year / month / weekday) so the confusion score is real, not
//  self-reported. Unanswered questions lower answer_presence and
//  therefore quality (→ uncertain), never "normal".
// ──────────────────────────────────────────────────────────
import type { FeatureBag } from "../types";
import { clamp01, mean } from "./signal";

export interface OrientationAnswer {
  id: string;
  given: string;
  /** expected answer if verifiable (year/month/weekday); undefined otherwise */
  expected?: string;
  latencyMs: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

export function buildOrientationQuestions() {
  const now = new Date();
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const days = [
    "sunday", "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday",
  ];
  return [
    { id: "year", prompt: "What year is it?", expected: String(now.getFullYear()) },
    { id: "month", prompt: "What month is it?", expected: months[now.getMonth()] },
    { id: "weekday", prompt: "What day of the week is it?", expected: days[now.getDay()] },
    { id: "place", prompt: "Where are you right now?", expected: undefined },
  ];
}

export function computeOrientation(answers: OrientationAnswer[]): FeatureBag {
  const total = answers.length || 1;
  const answered = answers.filter((a) => norm(a.given).length > 0);
  const presence = answered.length / total;

  // confusion = fraction of *verifiable* questions answered wrong
  const verifiable = answers.filter((a) => a.expected !== undefined);
  let wrong = 0;
  for (const a of verifiable) {
    const g = norm(a.given);
    const e = norm(a.expected!);
    if (g.length === 0) wrong += 1; // unanswered verifiable = wrong
    else if (!(g === e || g.includes(e) || e.includes(g))) wrong += 1;
  }
  const confusion = verifiable.length ? wrong / verifiable.length : 0;

  const latencies = answered.map((a) => a.latencyMs).filter((x) => x > 0);
  const latency = latencies.length ? mean(latencies) : answered.length ? 0 : 99999;

  // quality reflects how much we could actually assess
  const quality = clamp01(presence);

  return {
    orientation_answer_presence: presence,
    orientation_confusion_score: confusion,
    orientation_response_latency: Math.round(latency),
    orientation_questions_total: total,
    orientation_wrong: wrong,
    orientation_quality: quality,
  };
}
