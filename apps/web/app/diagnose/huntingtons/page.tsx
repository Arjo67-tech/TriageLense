"use client";
import { useRef, useState, useCallback } from "react";
import type { HuntingtonsInputs } from "@/lib/diseases/huntingtons/analyze";
import { computeChoreoMetrics, interpretChorea, type LandmarkSample } from "@/lib/diseases/huntingtons/chorea";
import type { AssessmentResult } from "@/lib/types";
import { ResultCard } from "@/components/ResultCard";
import { buildResult, flag, tri } from "@/lib/detectors/util";

const BLANK: HuntingtonsInputs = {
  cagKnown: false, cagRepeat: undefined, age: 0,
  chorea: false, balanceFalls: false, gaitUnsteady: false, fineMotor: false,
  thinkingSlower: false, concentration: false, recentMemory: false,
  moodChanges: false, behaviorChanges: false,
  parentSibling: false, familyUnexplained: false,
};

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16 }} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)", marginBottom: 12 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const IDX = { lWrist: 15, rWrist: 16, lElbow: 13, rElbow: 14 };

function capScore(age: number, cag: number) { return (age * (cag - 33.66)) / 100; }

export default function HuntingtonsPage() {
  const [inputs, setInputs] = useState<HuntingtonsInputs>(BLANK);
  const [ageStr, setAgeStr] = useState("");
  const [cagStr, setCagStr] = useState("");
  const [result, setResult] = useState<AssessmentResult | null>(null);

  // camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplesRef = useRef<LandmarkSample[]>([]);
  const rafRef = useRef<number>(0);
  const poseLandmarkerRef = useRef<unknown>(null);
  const [camState, setCamState] = useState<"idle" | "loading" | "ready" | "recording" | "done" | "error">("idle");
  const [camError, setCamError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [choreoResult, setChoreoResult] = useState<ReturnType<typeof interpretChorea> | null>(null);

  function set<K extends keyof HuntingtonsInputs>(key: K, val: HuntingtonsInputs[K]) {
    setInputs((p) => ({ ...p, [key]: val }));
    setResult(null);
  }

  const startCamera = useCallback(async () => {
    setCamState("loading");
    setCamError(null);
    try {
      const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamState("ready");
    } catch (e) { setCamError(String(e)); setCamState("error"); }
  }, []);

  const startRecording = useCallback(() => {
    samplesRef.current = [];
    setChoreoResult(null);
    setResult(null);
    const start = performance.now();
    const DURATION = 10000;
    setCamState("recording");

    const tick = () => {
      const now = performance.now();
      const elapsed = now - start;
      setCountdown(Math.max(0, Math.ceil((DURATION - elapsed) / 1000)));

      const video = videoRef.current;
      const landmarker = poseLandmarkerRef.current as {
        detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Array<Array<{ x: number; y: number; z: number }>> }
      } | null;

      if (video && landmarker && video.readyState >= 2) {
        try {
          const det = landmarker.detectForVideo(video, now);
          if (det.landmarks.length > 0) {
            const lm = det.landmarks[0];
            samplesRef.current.push({
              t: now,
              lWrist: [lm[IDX.lWrist].x, lm[IDX.lWrist].y],
              rWrist: [lm[IDX.rWrist].x, lm[IDX.rWrist].y],
              lElbow: [lm[IDX.lElbow].x, lm[IDX.lElbow].y],
              rElbow: [lm[IDX.rElbow].x, lm[IDX.rElbow].y],
            });
          }
          const canvas = canvasRef.current;
          if (canvas && video) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx && det.landmarks.length > 0) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              const lm = det.landmarks[0];
              [[IDX.lElbow, IDX.lWrist], [IDX.rElbow, IDX.rWrist]].forEach(([a, b]) => {
                ctx.beginPath();
                ctx.moveTo((1 - lm[a].x) * canvas.width, lm[a].y * canvas.height);
                ctx.lineTo((1 - lm[b].x) * canvas.width, lm[b].y * canvas.height);
                ctx.strokeStyle = "rgba(99,200,255,0.7)";
                ctx.lineWidth = 3;
                ctx.stroke();
              });
              [IDX.lWrist, IDX.rWrist, IDX.lElbow, IDX.rElbow].forEach((i) => {
                ctx.beginPath();
                ctx.arc((1 - lm[i].x) * canvas.width, lm[i].y * canvas.height, 8, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(99,200,255,0.9)";
                ctx.fill();
              });
            }
          }
        } catch { /* frame skip */ }
      }

      if (elapsed < DURATION) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCamState("done");
        const metrics = computeChoreoMetrics(samplesRef.current);
        const cr = interpretChorea(metrics);
        setChoreoResult(cr);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  function runCombined() {
    const age = parseInt(ageStr, 10) || 0;
    const cag = inputs.cagKnown ? parseInt(cagStr, 10) : undefined;

    // ── Weights ────────────────────────────────────────────────
    // Camera chorea: 35 pts max
    // Motor questionnaire: 25 pts max
    // Cognitive: 15 pts max
    // Psychiatric: 10 pts max
    // Family history: 15 pts max
    // CAP score override: up to +20 bonus

    let score = 0;

    // Camera (35pts)
    const choreoScore = choreoResult ? choreoResult.choreaProbability * 35 : 0;
    score += choreoScore;

    // Motor (25pts)
    const motorHits = [inputs.chorea, inputs.balanceFalls, inputs.gaitUnsteady, inputs.fineMotor].filter(Boolean).length;
    score += (motorHits / 4) * 25;

    // Cognitive (15pts)
    const cogHits = [inputs.thinkingSlower, inputs.concentration, inputs.recentMemory].filter(Boolean).length;
    score += (cogHits / 3) * 15;

    // Psychiatric (10pts)
    const psychHits = [inputs.moodChanges, inputs.behaviorChanges].filter(Boolean).length;
    score += (psychHits / 2) * 10;

    // Family (15pts)
    if (inputs.parentSibling) score += 15;
    else if (inputs.familyUnexplained) score += 7;

    // CAP bonus (up to +20)
    let capVal: number | null = null;
    if (inputs.cagKnown && cag != null && Number.isFinite(cag) && age > 0) {
      capVal = capScore(age, cag);
      if (cag >= 36) score += 20;
      else if (capVal > 60) score += 15;
      else if (capVal > 40) score += 8;
    }

    score = Math.min(Math.round(score), 100);

    const features: Record<string, number | boolean | string | null> = {
      age, cag_repeat: cag ?? null, cap_score: capVal != null ? Math.round(capVal * 10) / 10 : null,
      chorea_probability: choreoResult ? Math.round(choreoResult.choreaProbability * 100) / 100 : null,
      motion_amplitude: choreoResult ? Math.round(choreoResult.metrics.motionAmplitude * 10000) / 10000 : null,
      burstiness: choreoResult ? Math.round(choreoResult.metrics.burstiness * 1000) / 1000 : null,
      bilateral_asymmetry: choreoResult ? Math.round(choreoResult.metrics.bilateralAsymmetry * 100) / 100 : null,
      motor_hits: motorHits, cog_hits: cogHits, psych_hits: psychHits,
      family_first_degree: inputs.parentSibling,
    };

    const hasCam = choreoResult !== null;
    const camDetected = choreoResult ? choreoResult.choreaProbability > 0.5 : false;
    const camQuality = choreoResult?.metrics.quality ?? 0;

    const redFlags = [
      flag({
        id: "chorea_camera",
        label: "Involuntary movement — camera",
        detected: hasCam && camDetected,
        confidence: hasCam ? (camQuality * choreoResult!.choreaProbability) : 0.2,
        source: hasCam ? "camera" : "rule",
        explanation: hasCam ? choreoResult!.interpretation : "Camera test not completed.",
      }),
      flag({
        id: "motor_symptoms",
        label: `Motor symptoms (${motorHits}/4)`,
        detected: motorHits >= 2,
        confidence: motorHits >= 3 ? 0.85 : motorHits >= 2 ? 0.65 : 0.2,
        source: "user_report",
        explanation: motorHits === 0 ? "No motor symptoms." : `${motorHits}/4: ${[inputs.chorea && "chorea", inputs.balanceFalls && "balance/falls", inputs.gaitUnsteady && "gait", inputs.fineMotor && "fine motor"].filter(Boolean).join(", ")}.`,
      }),
      flag({
        id: "cognitive",
        label: `Cognitive symptoms (${cogHits}/3)`,
        detected: cogHits >= 2,
        confidence: cogHits >= 2 ? 0.7 : 0.2,
        source: "user_report",
        explanation: cogHits === 0 ? "No cognitive symptoms." : `${cogHits}/3 cognitive symptoms reported.`,
      }),
      flag({
        id: "family_history",
        label: "Family history of HD",
        detected: inputs.parentSibling || inputs.familyUnexplained,
        confidence: inputs.parentSibling ? 0.9 : inputs.familyUnexplained ? 0.6 : 0.1,
        source: "user_report",
        explanation: inputs.parentSibling ? "First-degree relative with confirmed HD (50% inheritance risk)." : inputs.familyUnexplained ? "Unexplained movement disorder in family." : "No family history.",
      }),
    ];

    if (capVal !== null) {
      redFlags.unshift(flag({
        id: "genetic_cap",
        label: `Genetic risk — CAG ${cag}, CAP ${Math.round(capVal * 10) / 10}`,
        detected: (cag ?? 0) >= 36 || capVal > 60,
        confidence: 0.98,
        source: "user_report",
        explanation: (cag ?? 0) >= 36 ? `CAG ${cag} ≥ 36 — confirmed HD expansion range.` : `CAP score ${Math.round(capVal * 10) / 10} (${capVal > 60 ? "high" : capVal > 40 ? "medium" : "low"} risk).`,
      }));
    }

    const uncertain = !hasCam && motorHits === 0 && cogHits === 0;

    setResult(buildResult({
      module: "huntingtons",
      priority: score >= 60 ? "P1" : score >= 30 ? "P2" : "P3",
      redFlags,
      features,
      severityScore: score,
      uncertain,
      explanation: score >= 60
        ? `Combined score ${score}/100 — multiple HD-associated signals present. Neurologist referral warranted. This is a screen, not a diagnosis.`
        : score >= 30
        ? `Combined score ${score}/100 — some HD-associated features. Follow up with a clinician if symptoms are new or worsening.`
        : `Combined score ${score}/100 — no strong HD indicators detected.`,
      nextQuestions: score >= 30
        ? ["Have you had genetic testing for the HTT CAG repeat?", "Has a neurologist evaluated your movement symptoms?", "Are any first-degree relatives under HD specialist care?"]
        : ["Consider genetic counseling if a family member has HD."],
    }));
  }

  function resetCamera() {
    samplesRef.current = [];
    setCamState("ready");
    setChoreoResult(null);
    setResult(null);
  }

  const canRun = parseInt(ageStr, 10) > 0;

  return (
    <main>
      <div className="disclaimer">
        <b>Not a medical device.</b> Combined camera + symptom screen. Cannot diagnose Huntington&apos;s disease.
      </div>
      <h1>Huntington&apos;s Disease Screen</h1>
      <p className="sub">Camera chorea test + symptom questionnaire — combined weighted score.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* ── Left: camera ── */}
        <div>
          <div className="card" style={{ marginBottom: 0 }}>
            <h3 style={{ marginBottom: 8 }}>Step 1 — Chorea motion test</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Extend both arms out to the sides and hold still for 10 seconds.
            </p>

            {/* Video always in DOM so ref is available before camera starts */}
            <div style={{ position: "relative", marginBottom: 10, display: camState === "idle" || camState === "loading" || camState === "error" ? "none" : "block" }}>
              <video ref={videoRef} muted playsInline
                style={{ width: "100%", borderRadius: 8, display: "block", transform: "scaleX(-1)", position: "relative", zIndex: 1 }} />
              <canvas ref={canvasRef}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", borderRadius: 8, pointerEvents: "none", zIndex: 2 }} />
              {camState === "recording" && (
                <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.75)", color: "#fff", borderRadius: 8, padding: "4px 12px", fontSize: 22, fontWeight: 700, zIndex: 3 }}>
                  {countdown}s
                </div>
              )}
            </div>

            {camState === "idle" && <button className="btn-primary" onClick={startCamera}>Enable Camera</button>}
            {camState === "loading" && <p className="muted">Loading pose model…</p>}
            {camState === "error" && <p style={{ color: "var(--red)", fontSize: 13 }}>{camError}</p>}
            {camState === "ready" && <button className="btn-primary" onClick={startRecording}>Start 10s test</button>}
            {camState === "recording" && <p className="muted" style={{ fontSize: 13 }}>Hold arms outstretched and still…</p>}
            {camState === "done" && choreoResult && (
              <div>
                <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 8,
                  background: choreoResult.choreaProbability > 0.5 ? "rgba(220,50,50,0.12)" : "rgba(50,200,100,0.1)" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Chorea signal: {Math.round(choreoResult.choreaProbability * 100)}%</span>
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>{choreoResult.interpretation}</p>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, display: "flex", gap: 16 }}>
                  <span>Amplitude: {(choreoResult.metrics.motionAmplitude * 1000).toFixed(1)}</span>
                  <span>Burstiness: {(choreoResult.metrics.burstiness * 100).toFixed(0)}%</span>
                  <span>Asymmetry: {choreoResult.metrics.bilateralAsymmetry.toFixed(1)}×</span>
                </div>
                <button className="btn-ghost" style={{ fontSize: 13 }} onClick={resetCamera}>Retake</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: questionnaire ── */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Step 2 — Symptom questionnaire</h3>

          <Section title="About you">
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Age</label>
              <input type="number" min={1} max={120} value={ageStr}
                onChange={(e) => { setAgeStr(e.target.value); setResult(null); }}
                placeholder="e.g. 42"
                style={{ padding: "6px 10px", width: 100, borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--fg)" }} />
            </div>
            <Checkbox label="I know my CAG repeat count" checked={inputs.cagKnown} onChange={(v) => set("cagKnown", v)} />
            {inputs.cagKnown && (
              <div style={{ marginLeft: 26, marginBottom: 6 }}>
                <input type="number" min={10} max={120} value={cagStr}
                  onChange={(e) => { setCagStr(e.target.value); setResult(null); }}
                  placeholder="CAG e.g. 42"
                  style={{ padding: "5px 8px", width: 100, borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--fg)", fontSize: 13 }} />
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>≥36 = HD range</p>
              </div>
            )}
          </Section>

          <Section title="Motor (weight 25%)">
            <Checkbox label="Involuntary jerking/writhing movements (chorea)" checked={inputs.chorea} onChange={(v) => set("chorea", v)} />
            <Checkbox label="Balance problems or unexplained falls" checked={inputs.balanceFalls} onChange={(v) => set("balanceFalls", v)} />
            <Checkbox label="Unsteady or lurching walk" checked={inputs.gaitUnsteady} onChange={(v) => set("gaitUnsteady", v)} />
            <Checkbox label="Difficulty with fine motor (buttons, writing)" checked={inputs.fineMotor} onChange={(v) => set("fineMotor", v)} />
          </Section>

          <Section title="Cognitive (weight 15%)">
            <Checkbox label="Noticeably slower thinking / problem-solving" checked={inputs.thinkingSlower} onChange={(v) => set("thinkingSlower", v)} />
            <Checkbox label="Difficulty concentrating" checked={inputs.concentration} onChange={(v) => set("concentration", v)} />
            <Checkbox label="Recent memory worsening" checked={inputs.recentMemory} onChange={(v) => set("recentMemory", v)} />
          </Section>

          <Section title="Psychiatric (weight 10%)">
            <Checkbox label="Persistent mood changes / irritability" checked={inputs.moodChanges} onChange={(v) => set("moodChanges", v)} />
            <Checkbox label="Behavior changes noticed by others" checked={inputs.behaviorChanges} onChange={(v) => set("behaviorChanges", v)} />
          </Section>

          <Section title="Family history (weight 15%)">
            <Checkbox label="Parent or sibling with confirmed HD" checked={inputs.parentSibling} onChange={(v) => set("parentSibling", v)} />
            <Checkbox label="Unexplained movement disorder in family" checked={inputs.familyUnexplained} onChange={(v) => set("familyUnexplained", v)} />
          </Section>
        </div>
      </div>

      {/* ── Combined weight bar ── */}
      <div className="card" style={{ marginTop: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 130 }}>Camera chorea (35%)</span>
          <div style={{ flex: 1, height: 8, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${choreoResult ? choreoResult.choreaProbability * 100 : 0}%`, background: "var(--blue, #4ea8ff)", transition: "width 0.4s" }} />
          </div>
          <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 36 }}>{choreoResult ? Math.round(choreoResult.choreaProbability * 100) : "—"}%</span>
        </div>
        {[
          ["Motor (25%)", ([inputs.chorea, inputs.balanceFalls, inputs.gaitUnsteady, inputs.fineMotor].filter(Boolean).length / 4) * 100],
          ["Cognitive (15%)", ([inputs.thinkingSlower, inputs.concentration, inputs.recentMemory].filter(Boolean).length / 3) * 100],
          ["Psychiatric (10%)", ([inputs.moodChanges, inputs.behaviorChanges].filter(Boolean).length / 2) * 100],
          ["Family history (15%)", inputs.parentSibling ? 100 : inputs.familyUnexplained ? 50 : 0],
        ].map(([label, pct]) => (
          <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 130 }}>{label}</span>
            <div style={{ flex: 1, height: 8, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--blue, #4ea8ff)", transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 36 }}>{Math.round(Number(pct))}%</span>
          </div>
        ))}

        <button onClick={runCombined} disabled={!canRun} className="btn-primary" style={{ marginTop: 16 }}>
          Run Combined Assessment
        </button>
        {!canRun && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Enter your age to continue.</p>}
      </div>

      {result && <ResultCard result={result} title="Huntington's Screen — combined score" />}
    </main>
  );
}
