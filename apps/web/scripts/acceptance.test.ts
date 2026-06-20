/* eslint-disable no-console */
// Acceptance harness: drives the REAL extractors with synthetic motion
// streams and asserts the spec's acceptance behaviors. Run with `npx tsx`.
import type { Landmark } from "../lib/mediapipe/indices";
import { FACE, POSE, HAND } from "../lib/mediapipe/indices";
import type { HandFrame } from "../lib/mediapipe/hands";
import type { FaceFrame } from "../lib/mediapipe/face";

import { FaceExtractor } from "../lib/extract/faceExtractor";
import {
  ArmDriftExtractor,
  BalanceExtractor,
  BreathingExtractor,
} from "../lib/extract/poseExtractor";
import {
  TapExtractor,
  TremorExtractor,
  tapAsymmetry,
} from "../lib/extract/handsExtractor";
import { computeOrientation } from "../lib/extract/questions";

import { analyzeStroke } from "../lib/detectors/stroke";
import { analyzeParkinsons } from "../lib/detectors/parkinsons";
import { analyzeConcussion } from "../lib/detectors/concussion";
import { analyzeHeat } from "../lib/detectors/heat";
import { analyzeRespiratory } from "../lib/detectors/respiratory";
import { analyzeGeneral } from "../lib/detectors/general";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

const FPS = 30;
const dt = 1000 / FPS;
const lm = (x: number, y: number, v = 1): Landmark => ({ x, y, z: 0, visibility: v });

// ── helpers to synthesize landmark sets ──────────────────
function poseArr(): Landmark[] {
  return Array.from({ length: 33 }, () => lm(0.5, 0.5));
}
function faceArr(): Landmark[] {
  return Array.from({ length: 478 }, () => lm(0.5, 0.5));
}
function handFrame(thumb: Landmark, index: Landmark): HandFrame {
  const hand = Array.from({ length: 21 }, () => lm(0.5, 0.5));
  hand[HAND.WRIST] = lm(0.5, 0.7);
  hand[HAND.INDEX_MCP] = lm(0.5, 0.5); // palm size ~0.2
  hand[HAND.THUMB_TIP] = thumb;
  hand[HAND.INDEX_TIP] = index;
  return { hands: [{ landmarks: hand, handedness: "Right" }] };
}

// ════════════════════════════════════════════════════════
console.log("\nSTROKE — face symmetry");
{
  const sym = new FaceExtractor();
  for (let i = 0; i < 40; i++) {
    const f = faceArr();
    f[FACE.FOREHEAD] = lm(0.5, 0.2);
    f[FACE.CHIN] = lm(0.5, 0.8);
    f[FACE.LEFT_EYE_INNER] = lm(0.45, 0.4);
    f[FACE.RIGHT_EYE_INNER] = lm(0.55, 0.4);
    f[FACE.MOUTH_LEFT] = lm(0.42, 0.6);
    f[FACE.MOUTH_RIGHT] = lm(0.58, 0.6);
    sym.push({ landmarks: f, blendshapes: { mouthSmileLeft: 0.8, mouthSmileRight: 0.8 } });
  }
  const r = analyzeStroke(sym.snapshot());
  const fa = r.redFlags.find((x) => x.id === "face_asymmetry")!;
  check("symmetric smile → face asymmetry NOT detected", !fa.detected, JSON.stringify(sym.snapshot()));

  const droop = new FaceExtractor();
  for (let i = 0; i < 40; i++) {
    const f = faceArr();
    f[FACE.FOREHEAD] = lm(0.5, 0.2);
    f[FACE.CHIN] = lm(0.5, 0.8);
    f[FACE.LEFT_EYE_INNER] = lm(0.45, 0.4);
    f[FACE.RIGHT_EYE_INNER] = lm(0.55, 0.4);
    f[FACE.MOUTH_LEFT] = lm(0.42, 0.66); // left corner droops down
    f[FACE.MOUTH_RIGHT] = lm(0.58, 0.58);
    droop.push({ landmarks: f, blendshapes: { mouthSmileLeft: 0.1, mouthSmileRight: 0.85 } });
  }
  const r2 = analyzeStroke(droop.snapshot());
  const fa2 = r2.redFlags.find((x) => x.id === "face_asymmetry")!;
  check("faked facial droop → face asymmetry detected", fa2.detected, JSON.stringify(droop.snapshot()));
}

console.log("STROKE — arm drift");
{
  const ad = new ArmDriftExtractor();
  for (let i = 0; i < 120; i++) {
    const p = poseArr();
    p[POSE.LEFT_SHOULDER] = lm(0.4, 0.4);
    p[POSE.RIGHT_SHOULDER] = lm(0.6, 0.4);
    p[POSE.LEFT_HIP] = lm(0.42, 0.7);
    p[POSE.RIGHT_HIP] = lm(0.58, 0.7);
    p[POSE.LEFT_WRIST] = lm(0.35, 0.4); // steady
    p[POSE.RIGHT_WRIST] = lm(0.65, 0.4 + 0.3 * (i / 120)); // slowly lowers
    ad.push(p, i * dt);
  }
  const r = analyzeStroke(ad.snapshot());
  const drift = r.redFlags.find((x) => x.id === "arm_drift")!;
  check("one arm slowly lowers → arm drift detected", drift.detected, JSON.stringify(ad.snapshot()));
}

console.log("STROKE — speech abnormality + uncertain");
{
  const r = analyzeStroke({
    speech_similarity_score: 0.3,
    phrase_completion: 0.4,
    response_latency: 1000,
    speech_quality: 0.9,
  });
  const sp = r.redFlags.find((x) => x.id === "speech_abnormality")!;
  check("garbled phrase → speech abnormality detected", sp.detected);

  const empty = analyzeStroke({});
  check("no features → status uncertain (not normal)", empty.status === "uncertain", empty.status);
}

console.log("PARKINSONS — tapping asymmetry, decay, tremor");
{
  function tap(side: "left" | "right", freq: number, decay = false) {
    const ex = new TapExtractor(side);
    const N = 150;
    for (let i = 0; i < N; i++) {
      const t = (i / FPS);
      const amp = decay ? 0.6 * (1 - 0.7 * (i / N)) : 0.6;
      const sep = 0.15 + amp * 0.5 * (1 + Math.sin(2 * Math.PI * freq * t));
      ex.push(handFrame(lm(0.5, 0.6 + sep / 2), lm(0.5, 0.6 - sep / 2)), i * dt);
    }
    return ex.snapshot();
  }
  const right = tap("right", 5);
  const left = tap("left", 1.5);
  const merged = { ...right, ...left };
  const asym = tapAsymmetry(merged, merged);
  const r = analyzeParkinsons({ ...merged, ...asym });
  check("right fast / left slow → L/R asymmetry detected",
    r.redFlags.find((x) => x.id === "left_right_asymmetry")!.detected,
    JSON.stringify(asym));
  check("slow left hand → slowed_tapping(left) detected",
    r.redFlags.find((x) => x.id === "left_slowed_tapping")!.detected);

  const decayR = tap("right", 4, true);
  const rd = analyzeParkinsons(decayR);
  check("shrinking taps → amplitude_decay(right) detected",
    rd.redFlags.find((x) => x.id === "right_amplitude_decay")!.detected,
    `decay=${decayR["right_amplitude_decay"]}`);

  const tr = new TremorExtractor();
  for (let i = 0; i < 150; i++) {
    const t = i / FPS;
    const fr = handFrame(lm(0.5, 0.6), lm(0.5 + 0.02 * Math.sin(2 * Math.PI * 5 * t), 0.5 + 0.02 * Math.cos(2 * Math.PI * 5 * t)));
    tr.push(fr, i * dt);
  }
  const rt = analyzeParkinsons(tr.snapshot());
  check("5 Hz hand shake → tremor_like_motion detected",
    rt.redFlags.find((x) => x.id === "tremor_like_motion")!.detected,
    JSON.stringify(tr.snapshot()));

  const unc = analyzeParkinsons({});
  check("no hand data → parkinsons uncertain (not normal)", unc.status === "uncertain", unc.status);
}

console.log("RESPIRATORY — breathing rate, sentence, priorities");
{
  const br = new BreathingExtractor();
  const N = 30 * FPS; // 30 s
  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    const p = poseArr();
    p[POSE.LEFT_SHOULDER] = lm(0.4, 0.4 + 0.012 * Math.sin(2 * Math.PI * 0.45 * t)); // ~27/min
    p[POSE.RIGHT_SHOULDER] = lm(0.6, 0.4 + 0.012 * Math.sin(2 * Math.PI * 0.45 * t));
    br.push(p, i * dt);
  }
  const snap = br.snapshot();
  const r = analyzeRespiratory(snap);
  check("fast visible breathing → bpm elevated", (snap["estimated_breaths_per_minute"] as number) > 22,
    `bpm=${snap["estimated_breaths_per_minute"]}`);
  check("elevated bpm → fast_breathing detected",
    r.redFlags.find((x) => x.id === "fast_breathing")!.detected);

  const r2 = analyzeRespiratory({ not_breathing_normally: undefined } as any);
  void r2;
  const p0 = analyzeRespiratory({}, { not_breathing_normally: true });
  check("not breathing normally → P0", p0.priority === "P0", p0.priority);

  const p1 = analyzeRespiratory(
    { estimated_breaths_per_minute: 30, breathing_signal_quality: 0.9, phrase_completion: 0.4, pause_count: 3, speech_quality: 0.9 },
    {},
  );
  check("cannot speak full sentence + fast breathing → P1", p1.priority === "P1", p1.priority);

  const punc = analyzeRespiratory({ breathing_signal_quality: 0.1, speech_quality: 0.1, pose_quality: 0.1 });
  check("poor signal → respiratory uncertain (not normal)", punc.status === "uncertain", punc.status);
}

console.log("CONCUSSION — danger signs, balance, orientation");
{
  const r = analyzeConcussion({}, { repeated_vomiting: true });
  check("repeated vomiting → P1", r.priority === "P1", r.priority);
  const r2 = analyzeConcussion({}, { cannot_stay_awake: true });
  check("cannot stay awake → P1", r2.priority === "P1", r2.priority);

  const bal = new BalanceExtractor();
  for (let i = 0; i < 120; i++) {
    const t = i / FPS;
    const p = poseArr();
    p[POSE.NOSE] = lm(0.5 + 0.04 * Math.sin(2 * Math.PI * 0.8 * t), 0.25);
    p[POSE.LEFT_SHOULDER] = lm(0.4 + 0.05 * Math.sin(2 * Math.PI * 0.7 * t), 0.4);
    p[POSE.RIGHT_SHOULDER] = lm(0.6 + 0.05 * Math.sin(2 * Math.PI * 0.7 * t), 0.4);
    p[POSE.LEFT_HIP] = lm(0.42 + 0.05 * Math.sin(2 * Math.PI * 0.7 * t), 0.7);
    p[POSE.RIGHT_HIP] = lm(0.58 + 0.05 * Math.sin(2 * Math.PI * 0.7 * t), 0.7);
    bal.push(p);
  }
  const rb = analyzeConcussion(bal.snapshot(), {});
  check("heavy sway → balance_concern detected",
    rb.redFlags.find((x) => x.id === "balance_concern")!.detected,
    JSON.stringify(bal.snapshot()));

  const wrong = computeOrientation([
    { id: "year", given: "1990", expected: "2026", latencyMs: 8000 },
    { id: "month", given: "", expected: "june", latencyMs: 0 },
    { id: "weekday", given: "banana", expected: "saturday", latencyMs: 9000 },
    { id: "place", given: "", latencyMs: 0 },
  ]);
  const rc = analyzeConcussion(wrong, {});
  check("wrong/late orientation → confusion_or_delayed_response detected",
    rc.redFlags.find((x) => x.id === "confusion_or_delayed_response")!.detected,
    JSON.stringify(wrong));

  const punc = analyzeConcussion({}, {});
  check("no live data, no danger signs → concussion uncertain (not normal)", punc.status === "uncertain", punc.status);
}

console.log("HEAT — exposure combinations");
{
  const wrong = computeOrientation([
    { id: "year", given: "2001", expected: "2026", latencyMs: 7000 },
    { id: "month", given: "", expected: "june", latencyMs: 0 },
    { id: "weekday", given: "", expected: "saturday", latencyMs: 0 },
    { id: "place", given: "home", latencyMs: 3000 },
  ]);
  const r = analyzeHeat(wrong, { heat_exposure: true });
  check("heat exposure + confusion → P1", r.priority === "P1", r.priority);

  const r2 = analyzeHeat({}, { heat_exposure: true, collapse_fainting: true });
  check("collapse/fainting → P1", r2.priority === "P1", r2.priority);

  const r3 = analyzeHeat(
    { speech_similarity_score: 0.3, phrase_completion: 0.4, speech_quality: 0.9 },
    { heat_exposure: true },
  );
  check("heat exposure + abnormal speech → P1", r3.priority === "P1", r3.priority);

  const r4 = analyzeHeat({}, { heat_exposure: true, dizziness: true, sweating_heavily: true });
  check("mild heat symptoms only → P2", r4.priority === "P2", r4.priority);
}

console.log("GENERAL — routing uses real detectors");
{
  // stroke signs present → recommend stroke, escalate
  const droop = new FaceExtractor();
  for (let i = 0; i < 40; i++) {
    const f = faceArr();
    f[FACE.FOREHEAD] = lm(0.5, 0.2); f[FACE.CHIN] = lm(0.5, 0.8);
    f[FACE.LEFT_EYE_INNER] = lm(0.45, 0.4); f[FACE.RIGHT_EYE_INNER] = lm(0.55, 0.4);
    f[FACE.MOUTH_LEFT] = lm(0.42, 0.67); f[FACE.MOUTH_RIGHT] = lm(0.58, 0.58);
    droop.push({ landmarks: f, blendshapes: { mouthSmileLeft: 0.05, mouthSmileRight: 0.85 } });
  }
  const ad = new ArmDriftExtractor();
  for (let i = 0; i < 120; i++) {
    const p = poseArr();
    p[POSE.LEFT_SHOULDER] = lm(0.4, 0.4); p[POSE.RIGHT_SHOULDER] = lm(0.6, 0.4);
    p[POSE.LEFT_HIP] = lm(0.42, 0.7); p[POSE.RIGHT_HIP] = lm(0.58, 0.7);
    p[POSE.LEFT_WRIST] = lm(0.35, 0.4);
    p[POSE.RIGHT_WRIST] = lm(0.65, 0.4 + 0.3 * (i / 120));
    ad.push(p, i * dt);
  }
  const feats = { ...droop.snapshot(), ...ad.snapshot(),
    speech_similarity_score: 0.3, phrase_completion: 0.4, speech_quality: 0.9 };
  const g = analyzeGeneral(feats, { is_responsive: true, breathing_ok: true });
  check("general: stroke signs → recommends stroke", g.recommendedModule === "stroke", g.recommendedModule);
  check("general: stroke signs → P0/P1/P2 (escalated)", g.priority !== "P3", g.priority);

  const g2 = analyzeGeneral({}, { conscious: false });
  check("general: unresponsive → P0", g2.priority === "P0", g2.priority);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
