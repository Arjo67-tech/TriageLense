// ──────────────────────────────────────────────────────────
//  Speech capture + scoring.
//  Uses the Web Speech API for live transcription and derives:
//    speech_similarity_score, phrase_completion, response_latency,
//    pause_count, stopped_mid_sentence, delayed_response.
//  Pure scoring functions are exported separately so detectors and
//  tests can call them without a microphone.
// ──────────────────────────────────────────────────────────
import { clamp01 } from "./util";

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  const n = normalizeText(s);
  return n ? n.split(" ") : [];
}

/** Length of the longest common subsequence of two token arrays. */
function lcsLen(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** 0..1 order-aware similarity between a spoken transcript and the target. */
export function speechSimilarity(transcript: string, target: string): number {
  const a = tokens(transcript);
  const b = tokens(target);
  if (!b.length) return 0;
  if (!a.length) return 0;
  const lcs = lcsLen(a, b);
  // F1-style: balances "said extra junk" against "said the right words".
  const recall = lcs / b.length;
  const precision = lcs / a.length;
  if (recall + precision === 0) return 0;
  return clamp01((2 * recall * precision) / (recall + precision));
}

/** Fraction of target words present (in order) in the transcript. */
export function phraseCompletion(transcript: string, target: string): number {
  const a = tokens(transcript);
  const b = tokens(target);
  if (!b.length) return 0;
  return clamp01(lcsLen(a, b) / b.length);
}

export interface SpeechResult {
  transcript: string;
  speech_similarity_score: number; // 0..1
  phrase_completion: number; // 0..1
  response_latency: number; // ms from start to first detected speech
  pause_count: number; // # of long (>1.2s) gaps between word arrivals
  longest_pause_ms: number;
  stopped_mid_sentence: boolean; // ended with <85% completion after speaking
  delayed_response: boolean; // latency > 3000ms or never spoke
  speaking_detected: boolean;
  /** 0..1 — confidence we could assess speech at all (mic + API working). */
  quality: number;
}

type SR = SpeechRecognition;

/** Live speech session. Resolves to a SpeechResult when stop() is called or
 *  the recognizer ends. Falls back to quality:0 (uncertain) if unsupported. */
export class SpeechSession {
  private rec: SR | null = null;
  private target: string;
  private startedAt = 0;
  private firstSpeechAt = 0;
  private lastWordAt = 0;
  private pauseCount = 0;
  private longestPause = 0;
  private finalTranscript = "";
  private interim = "";
  private supported: boolean;
  private onUpdate?: (partial: Partial<SpeechResult>) => void;

  constructor(target: string, onUpdate?: (p: Partial<SpeechResult>) => void) {
    this.target = target;
    this.onUpdate = onUpdate;
    const Ctor =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition)) ||
      null;
    this.supported = !!Ctor;
    if (Ctor) {
      const r: SR = new Ctor();
      r.lang = "en-US";
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      this.rec = r;
    }
  }

  start() {
    if (!this.rec) return;
    this.startedAt = performance.now();
    this.rec.onresult = (e: SpeechRecognitionEvent) => {
      const now = performance.now();
      if (!this.firstSpeechAt) this.firstSpeechAt = now;
      if (this.lastWordAt) {
        const gap = now - this.lastWordAt;
        if (gap > 1200) {
          this.pauseCount++;
          this.longestPause = Math.max(this.longestPause, gap);
        }
      }
      this.lastWordAt = now;

      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript + " ";
        else interimChunk += r[0].transcript + " ";
      }
      if (finalChunk) this.finalTranscript += finalChunk;
      this.interim = interimChunk;
      this.onUpdate?.(this.snapshot());
    };
    try {
      this.rec.start();
    } catch {
      /* already started */
    }
  }

  private currentTranscript(): string {
    return (this.finalTranscript + " " + this.interim).trim();
  }

  snapshot(): SpeechResult {
    const transcript = this.currentTranscript();
    const spoke = !!this.firstSpeechAt;
    const latency = spoke ? this.firstSpeechAt - this.startedAt : Infinity;
    const completion = phraseCompletion(transcript, this.target);
    const similarity = speechSimilarity(transcript, this.target);
    return {
      transcript,
      speech_similarity_score: similarity,
      phrase_completion: completion,
      response_latency: Number.isFinite(latency) ? Math.round(latency) : 99999,
      pause_count: this.pauseCount,
      longest_pause_ms: Math.round(this.longestPause),
      stopped_mid_sentence: spoke && completion < 0.85,
      delayed_response: !spoke || latency > 3000,
      speaking_detected: spoke,
      quality: this.supported ? (spoke ? 0.9 : 0.5) : 0,
    };
  }

  stop(): SpeechResult {
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    return this.snapshot();
  }

  get isSupported() {
    return this.supported;
  }
}
