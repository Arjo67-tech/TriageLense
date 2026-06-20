"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listReports,
  backendEnabled,
  type SavedReport,
} from "@/lib/butterbase";
import { PRIORITY_META } from "@/lib/detectors/priority";
import type { Priority } from "@/lib/types";

export default function HistoryPage() {
  const [rows, setRows] = useState<SavedReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendEnabled()) {
      setError("Backend is not configured (NEXT_PUBLIC_BUTTERBASE_URL).");
      setRows([]);
      return;
    }
    listReports()
      .then(setRows)
      .catch((e) => {
        setError(String(e));
        setRows([]);
      });
  }, []);

  return (
    <main>
      <Link href="/" className="muted">← All exams</Link>
      <h1 style={{ marginTop: 12 }}>Report history</h1>
      <p className="sub">
        Past assessments saved from this device, newest first. Stored in your
        Butterbase backend.
      </p>
      {error && <p className="err">{error}</p>}
      {rows === null && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && !error && (
        <p className="muted">No saved reports yet. Run an exam to create one.</p>
      )}
      <div className="grid">
        {rows?.map((r) => {
          const flags = r.red_flags?.items?.filter((f) => f.detected) ?? [];
          return (
            <div key={r.id} className="card">
              <div className="step-head">
                <h3 className="step-title">{r.module}</h3>
                <span className={`badge ${r.priority}`}>
                  {PRIORITY_META[r.priority as Priority]?.label ?? r.priority}
                </span>
              </div>
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <span className={`badge ${r.status}`}>{r.status}</span>
                <span className="muted">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              {r.recommended_module && (
                <p className="muted" style={{ marginTop: 8 }}>
                  → recommended: {r.recommended_module}
                </p>
              )}
              <p className="instruction" style={{ marginTop: 8 }}>
                {r.explanation}
              </p>
              {flags.length > 0 && (
                <p className="muted" style={{ marginTop: 6 }}>
                  🚩 {flags.map((f) => f.label).join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
