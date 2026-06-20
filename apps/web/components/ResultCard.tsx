"use client";
import type { AssessmentResult } from "@/lib/types";
import { PRIORITY_META } from "@/lib/detectors/priority";

function flagIcon(detected: boolean, uncertain: boolean) {
  if (uncertain) return "❔";
  return detected ? "🚩" : "✅";
}

export function ResultCard({
  result,
  title,
}: {
  result: AssessmentResult;
  title?: string;
}) {
  return (
    <div className="result">
      <div className="step-head">
        <h3 className="step-title">{title ?? result.module}</h3>
        <span className={`badge ${result.priority}`}>
          {PRIORITY_META[result.priority].label}
        </span>
      </div>
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <span className={`badge ${result.status}`}>{result.status}</span>
        <span className="muted">
          severity {result.severityScore} · confidence{" "}
          {Math.round(result.confidence * 100)}%
        </span>
      </div>
      <p className="instruction" style={{ marginTop: 10 }}>
        {result.explanation}
      </p>
      <ul className="flags">
        {result.redFlags.map((f) => {
          const uncertain = !f.detected && f.confidence < 0.35;
          return (
            <li key={f.id}>
              <span className="ico">{flagIcon(f.detected, uncertain)}</span>
              <span>
                <b>{f.label}</b>{" "}
                <span className="meta">
                  [{f.source} · {Math.round(f.confidence * 100)}%]
                </span>
                <br />
                <span className="meta">{f.explanation}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {result.nextQuestions.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
            Next best questions:
          </p>
          <ul className="flags">
            {result.nextQuestions.map((q, i) => (
              <li key={i}>
                <span className="ico">❓</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
