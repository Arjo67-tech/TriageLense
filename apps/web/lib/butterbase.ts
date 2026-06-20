// ──────────────────────────────────────────────────────────
//  Butterbase backend client (browser-side, anonymous role).
//  Only the public Data API is used — no secret key ships to the
//  client. The app is `public` access mode with no RLS, so the
//  anonymous role may insert/select triage_reports.
//
//  NOTE: Butterbase's jsonb parser rejects a *top-level* JSON array
//  as a column value, so arrays are wrapped as { items: [...] }.
// ──────────────────────────────────────────────────────────
import type { AssessmentResult } from "./types";

const BASE = process.env.NEXT_PUBLIC_BUTTERBASE_URL ?? "";
const TABLE = "triage_reports";

export const backendEnabled = () => BASE.length > 0;

/** Stable per-device id so a browser can list its own past reports. */
export function clientId(): string {
  if (typeof window === "undefined") return "server";
  const KEY = "triagelens_client_id";
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const gen: string =
    (crypto as any)?.randomUUID?.() ??
    `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  localStorage.setItem(KEY, gen);
  return gen;
}

export interface SavedReport {
  id: string;
  module: string;
  priority: string;
  status: string;
  severity_score: number | null;
  confidence: number | null;
  recommended_module: string | null;
  explanation: string | null;
  red_flags: { items: AssessmentResult["redFlags"] } | null;
  features: Record<string, unknown> | null;
  ems_packet: string | null;
  client_id: string | null;
  created_at: string;
}

export async function saveReport(
  result: AssessmentResult,
  emsPacket: string,
): Promise<SavedReport> {
  if (!backendEnabled()) throw new Error("Backend not configured");
  const body = {
    module: result.module,
    priority: result.priority,
    status: result.status,
    severity_score: result.severityScore,
    confidence: result.confidence,
    recommended_module: (result as any).recommendedModule ?? null,
    explanation: result.explanation,
    red_flags: { items: result.redFlags }, // array wrapped — see note above
    features: result.features,
    ems_packet: emsPacket,
    client_id: clientId(),
  };
  const res = await fetch(`${BASE}/${TABLE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Save failed (HTTP ${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function listReports(limit = 50): Promise<SavedReport[]> {
  if (!backendEnabled()) return [];
  const id = clientId();
  const url = `${BASE}/${TABLE}?client_id=eq.${encodeURIComponent(
    id,
  )}&order=created_at.desc&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`List failed (HTTP ${res.status})`);
  return res.json();
}
