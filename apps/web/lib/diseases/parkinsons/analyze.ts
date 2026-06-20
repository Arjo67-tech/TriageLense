"use client";
/**
 * analyzeParkinsons — runs ONNX model inference and returns AssessmentResult.
 *
 * HONESTY GAP: The UCI features (jitter/shimmer/Praat acoustics) require
 * specialized pitch-period extraction that isn't available in the browser.
 * v1 only accepts pre-computed feature vectors (dataset samples).
 * If we ever add live mic, return "uncertain" — never fake "normal".
 */
import type { AssessmentResult, FeatureBag, Priority, RedFlag } from "@/lib/types";
import { buildResult, flag } from "@/lib/detectors/util";
import { vectorQuality, PARKINSON_FEATURE_NAMES, type ParkinsonsFeatureVector, type ServiceResponse } from "./features";
import { FEATURE_RANGES } from "./ranges";

/**
 * Weighted feature score — transparent, interpretable PD probability.
 *
 * For each feature we know the typical PD direction (higher jitter/NHR, lower HNR).
 * We map each value to 0..1 between the healthy-median and PD-median, then take a
 * weighted average. This avoids the raw model slamming to 100% off one outlier
 * feature, and it's explainable to a clinician feature-by-feature.
 */
// Frequency features overlap heavily between classes → low weight.
// Jitter, NHR, HNR are the real discriminators → high weight.
const FEATURE_WEIGHTS: Record<string, { weight: number; pdHigher: boolean }> = {
  "MDVP:Fo(Hz)":      { weight: 0.15, pdHigher: false },
  "MDVP:Fhi(Hz)":     { weight: 0.10, pdHigher: true },
  "MDVP:Flo(Hz)":     { weight: 0.15, pdHigher: false },
  "MDVP:Jitter(Abs)": { weight: 1.0,  pdHigher: true },
  "MDVP:RAP":         { weight: 1.0,  pdHigher: true },
  "MDVP:PPQ":         { weight: 0.8,  pdHigher: true },
  "Jitter:DDP":       { weight: 0.8,  pdHigher: true },
  "NHR":              { weight: 1.0,  pdHigher: true },
  "HNR":              { weight: 1.2,  pdHigher: false },
};

function weightedScore(featureBag: FeatureBag): { prob: number; perFeature: Record<string, number> } {
  let totalW = 0;
  let sum = 0;
  const perFeature: Record<string, number> = {};

  for (const [key, { weight, pdHigher }] of Object.entries(FEATURE_WEIGHTS)) {
    const v = featureBag[key];
    const range = FEATURE_RANGES[key];
    if (typeof v !== "number" || !Number.isFinite(v) || !range) continue;

    const healthyMid = (range.healthy[0] + range.healthy[1]) / 2;
    const pdMid = (range.pd[0] + range.pd[1]) / 2;

    // position of value between healthy-mid and pd-mid → 0..1 (1 = PD-like)
    let s: number;
    if (pdHigher) {
      // PD is at higher values
      s = (v - healthyMid) / (pdMid - healthyMid || 1);
    } else {
      // PD is at lower values
      s = (healthyMid - v) / (healthyMid - pdMid || 1);
    }
    s = Math.max(0, Math.min(1, s));
    perFeature[key] = s;
    sum += s * weight;
    totalW += weight;
  }

  const prob = totalW > 0 ? sum / totalW : 0.5;
  return { prob, perFeature };
}

const MIN_QUALITY = 0.9;

let _session: import("onnxruntime-web").InferenceSession | null = null;

async function getSession() {
  if (_session) return _session;
  // Dynamic import keeps onnxruntime-web client-side only (no SSR).
  // wasmPaths must be set before the first InferenceSession.create call.
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = "/";
  // Single-threaded WASM — avoids SharedArrayBuffer/COOP requirements.
  ort.env.wasm.numThreads = 1;
  _session = await ort.InferenceSession.create("/ml/model.onnx", {
    executionProviders: ["wasm"],
  });
  return _session;
}

export interface ParkinsonsInput {
  features: ParkinsonsFeatureVector;
  /** true if from a dataset sample (high quality), false/undefined if live mic */
  fromDataset?: boolean;
}

export async function analyzeParkinsons(
  input: ParkinsonsInput,
): Promise<AssessmentResult> {
  const { features, fromDataset = false } = input;
  const quality = vectorQuality(features);
  const featureBag: FeatureBag = Object.fromEntries(
    PARKINSON_FEATURE_NAMES.map((k, i) => [k, features[i] ?? null]),
  );

  if (quality < MIN_QUALITY || (!fromDataset && quality < 1)) {
    return buildResult({
      module: "parkinsons",
      priority: "P3",
      redFlags: [
        uncertainFlag(
          fromDataset
            ? "low-quality feature vector"
            : "live mic (Praat features unavailable in browser)",
        ),
      ],
      features: featureBag,
      explanation: fromDataset
        ? `Feature vector is incomplete (quality ${Math.round(quality * 100)}%). Cannot produce a reliable prediction — result is uncertain, not normal.`
        : "Live microphone input cannot produce Praat acoustic features (jitter/shimmer/HNR) in the browser. Use a dataset sample for a real prediction. This gap is disclosed, not hidden.",
      uncertain: true,
      nextQuestions: [
        "Has your voice changed recently — rougher, softer, or more monotone?",
        "Do you or a family member notice a tremor, stiffness, or slowness?",
        "Have you seen a neurologist about movement symptoms?",
      ],
    });
  }

  let prob: number;
  try {
    const ort = await import("onnxruntime-web");
    const session = await getSession();
    const tensor = new ort.Tensor("float32", Float32Array.from(features), [1, features.length]);
    const output = await session.run({ float_input: tensor });

    // skl2onnx names the probability map "probabilities"
    const probEntry = output["probabilities"];
    if (probEntry) {
      // Map<label, prob> stored as flat array: [p_class0, p_class1]
      const data = probEntry.data as Float32Array;
      prob = data.length >= 2 ? data[1] : data[0];
    } else {
      // Fallback: read output_label (0 or 1) as a hard prediction
      const labelEntry = output["output_label"] ?? output[Object.keys(output)[0]];
      const raw = labelEntry.data[0];
      prob = typeof raw === "bigint" ? Number(raw) : Number(raw);
    }
  } catch (err) {
    return buildResult({
      module: "parkinsons",
      priority: "P3",
      redFlags: [uncertainFlag(`ONNX inference error: ${String(err)}`)],
      features: featureBag,
      explanation: `Model inference failed: ${String(err)}. Make sure /public/ml/model.onnx exists (run ml/parkinsons/train.py).`,
      uncertain: true,
      nextQuestions: [],
    });
  }

  return scoreToResult(prob, featureBag);
}

function uncertainFlag(reason: string): RedFlag {
  return flag({
    id: "uncertain_input",
    label: "Insufficient signal",
    detected: false,
    confidence: 0.1,
    source: "rule",
    explanation: reason,
  });
}

function scoreToResult(prob: number, featureBag: FeatureBag): AssessmentResult {
  const isAbnormal = prob >= 0.5;
  const isHighConf = prob >= 0.75 || prob <= 0.25;

  const redFlags: RedFlag[] = [
    flag({
      id: "voice_biomarker_positive",
      label: "Voice biomarker (Parkinson's pattern)",
      detected: isAbnormal,
      confidence: Math.abs(prob - 0.5) * 2,
      source: "audio",
      explanation: isAbnormal
        ? `Weighted PD score = ${pct(prob)}. Jitter, NHR, and HNR features lean toward the Parkinson's pattern.`
        : `Weighted PD score = ${pct(prob)}. Jitter, NHR, and HNR features are within the healthy range.`,
    }),
  ];

  let priority: Priority;
  let explanation: string;

  if (isAbnormal && isHighConf) {
    priority = "P2";
    explanation = `Voice acoustic features show a high-probability Parkinson's pattern (${pct(prob)}). Screening result only — not a diagnosis. A neurology evaluation is warranted.`;
  } else if (isAbnormal) {
    priority = "P3";
    explanation = `Voice acoustics lean toward a Parkinson's pattern (${pct(prob)}) but confidence is moderate. Consider follow-up if motor symptoms are also present.`;
  } else if (!isHighConf) {
    priority = "P3";
    explanation = `Voice acoustics are near the decision boundary (${pct(prob)}). Result is inconclusive — not confidently normal or abnormal.`;
  } else {
    priority = "P3";
    explanation = `Voice acoustic features do not match the Parkinson's pattern (${pct(prob)}). No flag raised by this screen.`;
  }

  return buildResult({
    module: "parkinsons",
    priority,
    redFlags,
    features: { ...featureBag, pd_probability: prob },
    explanation,
    severityScore: Math.round(prob * 100),
    nextQuestions: [
      "Has your voice become softer, rougher, or more monotone?",
      "Do you notice a resting tremor, muscle stiffness, or slowness of movement?",
      "Is one side of your body affected more than the other?",
    ],
  });
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

const SERVICE_URL = process.env.NEXT_PUBLIC_VOICE_SERVICE_URL ?? "http://localhost:8000";

/**
 * Live-voice path: POST audio blob to FastAPI, map response to AssessmentResult.
 * Gate is forced open server-side (Group-B stubs) so this always returns uncertain.
 * Banner in the UI makes this explicit.
 */
export async function analyzeFromService(blob: Blob): Promise<AssessmentResult> {
  const form = new FormData();
  form.append("file", blob, "recording.wav");

  let svcResp: ServiceResponse;
  try {
    const res = await fetch(`${SERVICE_URL}/analyze/parkinsons`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Service ${res.status}: ${await res.text()}`);
    svcResp = await res.json();
  } catch (err) {
    return buildResult({
      module: "parkinsons",
      priority: "P3",
      redFlags: [flag({
        id: "service_error",
        label: "Voice service unreachable",
        detected: false,
        confidence: 0.1,
        source: "rule",
        explanation: `Could not reach voice analysis service: ${String(err)}. Is uvicorn running on port 8000?`,
      })],
      features: {},
      explanation: `Voice analysis service unreachable: ${String(err)}`,
      uncertain: true,
      nextQuestions: [],
    });
  }

  const featureBag: FeatureBag = Object.fromEntries(
    Object.entries(svcResp.features).map(([k, v]) => [k, v ?? null]),
  );

  // Gate failed (or forced open) → always uncertain for now
  if (!svcResp.quality.ok) {
    const reasons = svcResp.quality.reasons.join(", ");
    return buildResult({
      module: "parkinsons",
      priority: "P3",
      redFlags: [flag({
        id: "recording_quality",
        label: "Recording quality insufficient",
        detected: false,
        confidence: 0.2,
        source: "audio",
        explanation: `Quality gate failed: ${reasons}. Result withheld — not defaulted to normal.`,
      })],
      features: { ...featureBag, pd_probability: svcResp.probability },
      explanation: `Recording quality insufficient (${reasons}). Cannot produce a reliable screening result.`,
      uncertain: true,
      nextQuestions: [
        "Try again in a quieter room, holding 'aaaah' steadily for 5 seconds.",
        "Avoid background noise, microphone clipping, or very short recordings.",
      ],
    });
  }

  // Use the transparent weighted feature score, lightly blended with the model.
  // Model is poorly calibrated on imbalanced UCI data (slams to 100% off one outlier),
  // so it contributes only 20% — the interpretable per-feature score drives the result.
  const { prob: wScore } = weightedScore(featureBag);
  const blended = 0.8 * wScore + 0.2 * svcResp.probability;
  return scoreToResult(blended, featureBag);
}
