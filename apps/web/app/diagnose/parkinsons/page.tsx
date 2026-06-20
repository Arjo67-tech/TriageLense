"use client";
import { useRef, useState } from "react";
import { analyzeFromService } from "@/lib/diseases/parkinsons/analyze";
import { blobToWav } from "@/lib/encodeWav";
import type { AssessmentResult } from "@/lib/types";
import { ResultCard } from "@/components/ResultCard";
import { ParkinsonsDebugPanel } from "@/components/ParkinsonsDebugPanel";

export default function ParkinsonsPage() {
  const [patientId, setPatientId] = useState("");
  const [recording, setRecording] = useState(false);
  const [rms, setRms] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingSec, setRecordingSec] = useState(0);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    setResult(null);
    setError(null);
    setRecordingSec(0);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setError("Microphone permission denied.");
      return;
    }

    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      const r = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
      setRms(r);
      setClipping(buf.some((v) => Math.abs(v) >= 0.999));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    timerRef.current = setInterval(() => setRecordingSec((s) => s + 1), 1000);

    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      setRms(0);
      setClipping(false);
      setRunning(true);
      try {
        const wav = await blobToWav(new Blob(chunksRef.current, { type: "audio/webm" }));
        const r = await analyzeFromService(wav);
        setResult(r);
      } catch (e) {
        setError(String(e));
      } finally {
        setRunning(false);
      }
    };
    rec.start(100);
    setRecording(true);
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  const levelPct = Math.min(rms * 400, 100);
  const levelColor = clipping ? "var(--red)" : rms > 0.05 ? "var(--green)" : "var(--yellow)";
  const levelHint = clipping ? "Too loud — move back from mic"
    : rms < 0.02 ? "Too quiet — speak up"
    : "Good level";

  return (
    <main style={{ maxWidth: 600, margin: "0 auto" }}>
      <div className="disclaimer">
        <b>Not a medical device.</b> Voice-based screening only. Cannot diagnose Parkinson&apos;s disease.
      </div>

      <h1>Parkinson&apos;s Voice Screen</h1>
      <p className="sub">
        Record the patient sustaining an &ldquo;aaah&rdquo; vowel. The model extracts fundamental
        frequency and harmonic noise ratio features and classifies against the UCI dataset
        (195 recordings, 31 subjects).
      </p>

      <div className="card">
        {/* Patient ID */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 6 }}>
            Patient ID / name (optional)
          </label>
          <input
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="e.g. Patient 001"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--fg)", fontSize: 14 }}
          />
        </div>

        {/* Instruction */}
        <div style={{ background: "var(--panel-2)", borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Instructions for patient:</p>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8, color: "var(--muted)" }}>
            <li>Take a deep breath</li>
            <li>Say <b style={{ color: "var(--fg)" }}>&ldquo;aaah&rdquo;</b> at a steady, comfortable pitch</li>
            <li>Hold for <b style={{ color: "var(--fg)" }}>5 seconds</b> without stopping</li>
            <li>Quiet room — no background noise</li>
          </ol>
        </div>

        {/* RMS meter — only while recording */}
        {recording && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 40 }}>
                {recordingSec}s
              </span>
              <div style={{ flex: 1, height: 12, background: "var(--panel-2)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${levelPct}%`, background: levelColor, transition: "width 0.05s" }} />
              </div>
              {clipping && <span style={{ color: "var(--red)", fontSize: 12, fontWeight: 700 }}>CLIP</span>}
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>{levelHint}</p>
          </div>
        )}

        {/* Record button */}
        {!recording ? (
          <button onClick={startRecording} className="btn-primary" style={{ width: "100%", padding: "12px 0", fontSize: 16 }}>
            Record Patient
          </button>
        ) : (
          <button onClick={stopRecording} className="btn-primary"
            style={{ width: "100%", padding: "12px 0", fontSize: 16, background: "var(--red)" }}>
            Stop &amp; Analyze
          </button>
        )}

        {running && (
          <p className="muted" style={{ marginTop: 12, textAlign: "center" }}>
            Extracting features and running model…
          </p>
        )}

        {error && (
          <div style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>
            <b>Error:</b> {error}
            {error.includes("fetch") || error.includes("Failed") ? (
              <p className="muted" style={{ marginTop: 4 }}>
                Make sure the FastAPI service is running:<br />
                <code>cd ml/parkinsons && uvicorn serve:app --port 8000</code>
              </p>
            ) : null}
          </div>
        )}
      </div>

      {result && (
        <div style={{ marginTop: 20 }}>
          {patientId && (
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
              Patient: <b style={{ color: "var(--fg)" }}>{patientId}</b>
            </p>
          )}
          <ResultCard result={result} title="Parkinson's Voice Screen" />
          <ParkinsonsDebugPanel features={result.features} live={false} />
        </div>
      )}
    </main>
  );
}
