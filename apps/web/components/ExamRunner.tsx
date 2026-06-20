"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  AssessmentResult,
  ExamConfig,
  ExamStep,
  FeatureBag,
  ModuleId,
  UserInputs,
} from "@/lib/types";
import { CHECKLISTS, mapInputs } from "@/lib/checklists";
import type { OrientationAnswer } from "@/lib/extract/questions";
import { computeOrientation } from "@/lib/extract/questions";

import { getFaceLandmarker, detectFace } from "@/lib/mediapipe/face";
import { getPoseLandmarker, detectPose, POSE } from "@/lib/mediapipe/pose";
import { getHandLandmarker, detectHands } from "@/lib/mediapipe/hands";

import { FaceExtractor } from "@/lib/extract/faceExtractor";
import {
  ArmDriftExtractor,
  BalanceExtractor,
  PostureExtractor,
  BreathingExtractor,
} from "@/lib/extract/poseExtractor";
import {
  TapExtractor,
  TremorExtractor,
  tapAsymmetry,
} from "@/lib/extract/handsExtractor";
import { EyeTrackingExtractor } from "@/lib/extract/eyeExtractor";
import { SpeechSession, type SpeechResult } from "@/lib/detectors/speech";

import { analyzeStroke } from "@/lib/detectors/stroke";
import { analyzeParkinsons } from "@/lib/detectors/parkinsons";
import { analyzeConcussion } from "@/lib/detectors/concussion";
import { analyzeHeat } from "@/lib/detectors/heat";
import { analyzeRespiratory } from "@/lib/detectors/respiratory";
import { analyzeGeneral } from "@/lib/detectors/general";

import { DebugPanel } from "./DebugPanel";
import { ResultCard } from "./ResultCard";
import { Checklist } from "./Checklist";
import { OrientationQA } from "./OrientationQA";
import { drawPoints, clearCanvas } from "./overlay";
import { emsPacket } from "@/lib/detectors/priority";
import { saveReport, backendEnabled } from "@/lib/butterbase";

type LmType = "face" | "pose" | "hands" | null;

function analyze(
  module: ModuleId,
  f: FeatureBag,
  u: UserInputs,
): AssessmentResult {
  switch (module) {
    case "stroke": return analyzeStroke(f, u);
    case "parkinsons": return analyzeParkinsons(f, u);
    case "concussion": return analyzeConcussion(f, u);
    case "heat": return analyzeHeat(f, u);
    case "respiratory": return analyzeRespiratory(f, u);
    case "general": return analyzeGeneral(f, u);
  }
}

/** Build the capture plan for a camera step: which landmarker + extractor. */
function buildPlan(module: ModuleId, step: ExamStep) {
  switch (step.kind) {
    case "face":
      return { lm: "face" as LmType, ex: new FaceExtractor(), dot: false };
    case "eye-tracking":
      return { lm: "face" as LmType, ex: new EyeTrackingExtractor(), dot: true };
    case "breathing":
      return { lm: "pose" as LmType, ex: new BreathingExtractor(), dot: false };
    case "pose": {
      if (step.id === "balance") return { lm: "pose" as LmType, ex: new BalanceExtractor(), dot: false };
      if (step.id === "steady") return { lm: "pose" as LmType, ex: new BalanceExtractor(), dot: false };
      if (step.id === "posture") return { lm: "pose" as LmType, ex: new PostureExtractor(), dot: false };
      return { lm: "pose" as LmType, ex: new ArmDriftExtractor(), dot: false }; // arms
    }
    case "hands": {
      if (step.id === "tap-left") return { lm: "hands" as LmType, ex: new TapExtractor("left"), dot: false };
      if (step.id === "tremor") return { lm: "hands" as LmType, ex: new TremorExtractor(), dot: false };
      return { lm: "hands" as LmType, ex: new TapExtractor("right"), dot: false }; // tap-right
    }
    default:
      return { lm: null as LmType, ex: null as any, dot: false };
  }
}

export function ExamRunner({ config }: { config: ExamConfig }) {
  const module = config.module;
  const steps = config.steps;

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const planRef = useRef<ReturnType<typeof buildPlan> | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const dotXRef = useRef(0.5);
  const lastVideoTsRef = useRef(-1);

  const mergedRef = useRef<FeatureBag>({});
  const inputsRef = useRef<UserInputs>({});

  const [phase, setPhase] = useState<"intro" | "running" | "done">("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [live, setLive] = useState<FeatureBag>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [dotPos, setDotPos] = useState({ x: 50, y: 50 });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedOnce = useRef(false);

  // controlled inputs for the current questions step
  const [checkState, setCheckState] = useState<Record<string, boolean | number | string>>({});
  const [orient, setOrient] = useState<OrientationAnswer[]>([]);

  const step = steps[stepIndex];
  const isCamera = step && ["face", "pose", "hands", "breathing", "eye-tracking"].includes(step.kind);

  const stopEngine = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    if (overlayRef.current) clearCanvas(overlayRef.current);
  }, []);

  const teardown = useCallback(() => {
    stopEngine();
    speechRef.current?.stop();
    speechRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopEngine]);

  useEffect(() => () => teardown(), [teardown]);

  const recompute = useCallback(() => {
    setResult(analyze(module, { ...mergedRef.current }, { ...inputsRef.current }));
  }, [module]);

  // ── start exam: acquire camera + mic ─────────────────
  const startExam = async () => {
    setError(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("Camera/microphone access was denied. Allow it and reload.");
      return;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play().catch(() => {});
    }
    setPhase("running");
    setStepIndex(0);
  };

  // ── run a camera-based step loop ─────────────────────
  const runCameraStep = useCallback(
    async (s: ExamStep) => {
      const plan = buildPlan(module, s);
      planRef.current = plan;
      setLoadingMsg("Loading models…");
      try {
        if (plan.lm === "face") await getFaceLandmarker();
        if (plan.lm === "pose") await getPoseLandmarker();
        if (plan.lm === "hands") await getHandLandmarker();
      } catch (e) {
        setError("Failed to load detection models. Check your connection.");
        return;
      }
      setLoadingMsg(null);
      lastVideoTsRef.current = -1;
      const startedAt = performance.now();
      const dur = (s.durationSec ?? 10) * 1000;

      const faceLm = plan.lm === "face" ? await getFaceLandmarker() : null;
      const poseLm = plan.lm === "pose" ? await getPoseLandmarker() : null;
      const handLm = plan.lm === "hands" ? await getHandLandmarker() : null;
      const video = videoRef.current!;
      const overlay = overlayRef.current!;

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        if (!video || video.currentTime === lastVideoTsRef.current) return;
        lastVideoTsRef.current = video.currentTime;
        const t = performance.now();
        const ts = Math.round(t);

        // animate eye dot
        if (plan.dot) {
          const phase = ((t - startedAt) / dur) * Math.PI * 2 * 2; // 2 sweeps
          const x = 0.5 + 0.4 * Math.sin(phase);
          const y = 0.5 + 0.15 * Math.sin(phase * 0.5);
          dotXRef.current = x;
          setDotPos({ x: x * 100, y: y * 100 });
        }

        try {
          if (faceLm) {
            const frame = detectFace(faceLm, video, ts);
            (plan.ex as any).push(
              ...(s.kind === "eye-tracking"
                ? [frame, dotXRef.current, t]
                : [frame]),
            );
            if (frame.landmarks) drawPoints(overlay, video, [frame.landmarks]);
          } else if (poseLm) {
            const pose = detectPose(poseLm, video, ts);
            if (s.kind === "breathing") (plan.ex as any).push(pose, t);
            else if (s.id === "arms" || (s.kind === "pose" && plan.ex instanceof ArmDriftExtractor))
              (plan.ex as any).push(pose, t);
            else (plan.ex as any).push(pose);
            if (pose) drawPoints(overlay, video, [pose], "rgba(62,207,142,.9)");
          } else if (handLm) {
            const hands = detectHands(handLm, video, ts);
            (plan.ex as any).push(hands, t);
            drawPoints(
              overlay,
              video,
              hands.hands.map((h) => h.landmarks),
              "rgba(245,196,81,.95)",
            );
          }
          setLive((plan.ex as any).snapshot());
        } catch {
          /* a dropped frame is fine */
        }
      };
      rafRef.current = requestAnimationFrame(loop);

      // countdown + auto-finish
      setTimeLeft(Math.ceil(dur / 1000));
      timerRef.current = setInterval(() => {
        const left = Math.max(0, dur - (performance.now() - startedAt));
        setTimeLeft(Math.ceil(left / 1000));
        if (left <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          finishStep();
        }
      }, 200);
    },
    [module],
  );

  // ── run a speech step ────────────────────────────────
  const runSpeechStep = useCallback((s: ExamStep) => {
    const sess = new SpeechSession(s.prompt ?? "", (p) => {
      setLive(mapSpeech(p as SpeechResult));
    });
    speechRef.current = sess;
    if (!sess.isSupported) {
      setLive({ speech_quality: 0, speech_note: "SpeechRecognition unsupported in this browser" });
    }
    sess.start();
  }, []);

  // ── advance into a step whenever stepIndex changes ───
  useEffect(() => {
    if (phase !== "running") return;
    const s = steps[stepIndex];
    setLive({});
    setCheckState({});
    setOrient([]);
    stopEngine();
    speechRef.current = null;

    if (s.kind === "speech") runSpeechStep(s);
    else if (s.kind === "questions") {
      /* nothing to start; user fills the form */
    } else runCameraStep(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIndex]);

  // ── finish current step: snapshot → merge → recompute ─
  const finishStep = useCallback(() => {
    const s = steps[stepIndex];
    stopEngine();

    if (s.kind === "speech") {
      const snap = speechRef.current?.stop();
      if (snap) Object.assign(mergedRef.current, mapSpeech(snap));
      speechRef.current = null;
    } else if (s.kind === "questions") {
      if (s.id === "orientation") {
        Object.assign(mergedRef.current, computeOrientation(orient));
      } else {
        const key = `${module}:${s.id}`;
        const mapped = mapInputs(key, checkState);
        Object.assign(inputsRef.current, mapped);
      }
    } else if (planRef.current?.ex) {
      const snap = (planRef.current.ex as any).snapshot() as FeatureBag;
      Object.assign(mergedRef.current, snap);
      // hands: once both taps captured, derive asymmetry
      if (s.kind === "hands") {
        Object.assign(
          mergedRef.current,
          tapAsymmetry(mergedRef.current, mergedRef.current),
        );
      }
    }

    recompute();

    if (stepIndex + 1 < steps.length) {
      setStepIndex((i) => i + 1);
    } else {
      teardown();
      setPhase("done");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, module, checkState, orient, recompute, teardown, stopEngine]);

  // persist the final report to Butterbase once, when the exam completes
  useEffect(() => {
    if (phase !== "done" || !result || savedOnce.current) return;
    if (!backendEnabled()) return;
    savedOnce.current = true;
    setSaveState("saving");
    const subs = (result as any).submodules as { result: AssessmentResult }[] | undefined;
    const packet = emsPacket(subs?.length ? subs.map((s) => s.result) : [result]);
    saveReport(result, packet)
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }, [phase, result]);

  const restart = () => {
    teardown();
    mergedRef.current = {};
    inputsRef.current = {};
    setResult(null);
    setLive({});
    setStepIndex(0);
    setSaveState("idle");
    savedOnce.current = false;
    setPhase("intro");
  };

  // ── render ───────────────────────────────────────────
  if (phase === "intro") {
    return (
      <main>
        <Link href="/" className="muted">← All exams</Link>
        <h1 style={{ marginTop: 12 }}>{config.title}</h1>
        <p className="sub">{config.blurb}</p>
        <div className="disclaimer">
          <b>Not a medical device.</b> This is a screening demo and cannot
          diagnose. In an emergency call your local emergency number now.
        </div>
        <div className="card">
          <h3>Before you start</h3>
          <p>
            You&apos;ll go through {steps.length} step
            {steps.length > 1 ? "s" : ""}. Allow camera and microphone access.
            The debug panel shows the live feature values being measured.
          </p>
          <div className="row">
            <button className="btn" onClick={startExam}>Start exam</button>
          </div>
          {error && <p className="err">{error}</p>}
        </div>
      </main>
    );
  }

  if (phase === "done" && result) {
    const subs =
      (result as any).submodules as
        | { module: ModuleId; result: AssessmentResult }[]
        | undefined;
    const packetResults = subs?.length ? subs.map((s) => s.result) : [result];
    return (
      <main>
        <Link href="/" className="muted">← All exams</Link>
        <h1 style={{ marginTop: 12 }}>{config.title} — report</h1>
        <ResultCard result={result} title={`${config.title} result`} />
        {subs?.length ? (
          <>
            <h3 style={{ marginTop: 20 }}>Module screens</h3>
            <div className="grid">
              {subs.map((s) => (
                <ResultCard key={s.module} result={s.result} title={s.module} />
              ))}
            </div>
          </>
        ) : null}
        <h3 style={{ marginTop: 20 }}>EMS handoff packet</h3>
        <textarea
          readOnly
          value={emsPacket(packetResults)}
          style={{
            width: "100%", minHeight: 200, background: "var(--panel-2)",
            color: "var(--text)", border: "1px solid var(--line)",
            borderRadius: 10, padding: 12, fontFamily: "var(--mono)", fontSize: 12.5,
          }}
        />
        <div className="row">
          <button className="btn" onClick={restart}>Run again</button>
          <Link href="/history" className="btn ghost">History</Link>
          <Link href="/" className="btn ghost">Done</Link>
          {backendEnabled() && (
            <span className="muted">
              {saveState === "saving" && "Saving report…"}
              {saveState === "saved" && "✓ Saved to backend"}
              {saveState === "error" && "⚠ Could not save report"}
            </span>
          )}
        </div>
      </main>
    );
  }

  // running
  const checklistItems = step.kind === "questions" && step.id !== "orientation"
    ? CHECKLISTS[`${module}:${step.id}`] ?? []
    : [];

  return (
    <main>
      <Link href="/" className="muted">← All exams</Link>
      <h1 style={{ marginTop: 12 }}>{config.title}</h1>
      <div className="exam">
        <div>
          {isCamera ? (
            <div className="stage">
              <video ref={videoRef} playsInline muted />
              <canvas ref={overlayRef} className="overlay" />
              {step.kind === "eye-tracking" && (
                <div
                  className="dot"
                  style={{
                    left: `${dotPos.x}%`,
                    top: `${dotPos.y}%`,
                    transform: "translate(-50%,-50%) scaleX(-1)",
                  }}
                />
              )}
            </div>
          ) : (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{step.prompt ? "Say this out loud:" : "Answer below"}</h3>
              {step.prompt && (
                <p style={{ fontSize: 22, fontWeight: 700 }}>&ldquo;{step.prompt}&rdquo;</p>
              )}
              {step.kind === "questions" && step.id === "orientation" && (
                <OrientationQA onChange={setOrient} />
              )}
              {checklistItems.length > 0 && (
                <Checklist items={checklistItems} value={checkState} onChange={setCheckState} />
              )}
            </div>
          )}
          {loadingMsg && <p className="muted">{loadingMsg}</p>}
        </div>

        <div className="side">
          <div className="card">
            <div className="step-head">
              <h2 className="step-title">{step.title}</h2>
              <span className="step-count">Step {stepIndex + 1}/{steps.length}</span>
            </div>
            <p className="instruction">{step.instruction}</p>
            {isCamera && step.durationSec && (
              <>
                <div className="timer">
                  <div style={{ width: `${100 * (1 - timeLeft / (step.durationSec || 1))}%` }} />
                </div>
                <p className="muted">{timeLeft}s remaining — hold the pose…</p>
              </>
            )}
            <div className="row">
              {step.kind === "speech" && (
                <button className="btn" onClick={finishStep}>Done speaking</button>
              )}
              {step.kind === "questions" && (
                <button className="btn" onClick={finishStep}>Continue</button>
              )}
              {isCamera && (
                <button className="btn ghost" onClick={finishStep}>Skip / finish step</button>
              )}
            </div>
          </div>

          <DebugPanel features={live} live={isCamera || step.kind === "speech"} />

          {result && <ResultCard result={result} title="Live assessment" />}
        </div>
      </div>
    </main>
  );
}

function mapSpeech(s: SpeechResult): FeatureBag {
  return {
    speech_similarity_score: s.speech_similarity_score,
    phrase_completion: s.phrase_completion,
    response_latency: s.response_latency,
    pause_count: s.pause_count,
    longest_pause_ms: s.longest_pause_ms,
    stopped_mid_sentence: s.stopped_mid_sentence ? 1 : 0,
    speech_quality: s.quality,
    speech_transcript: s.transcript,
  };
}
