"use client";
import type { FeatureBag, FeatureValue } from "@/lib/types";
import { FEATURE_RANGES } from "@/lib/diseases/parkinsons/ranges";

function fmt(v: FeatureValue): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "∞";
    return Math.abs(v) >= 100 || Number.isInteger(v)
      ? String(Math.round(v))
      : v.toFixed(4);
  }
  return String(v);
}

function fmtRange(r: [number, number]): string {
  const lo = Math.abs(r[0]) >= 10 ? r[0].toFixed(1) : r[0].toFixed(4);
  const hi = Math.abs(r[1]) >= 10 ? r[1].toFixed(1) : r[1].toFixed(4);
  return `${lo} – ${hi}`;
}

type Zone = "healthy" | "pd" | "both" | "neither";

function classify(v: number, r: { healthy: [number, number]; pd: [number, number] }): Zone {
  const inH = v >= r.healthy[0] && v <= r.healthy[1];
  const inP = v >= r.pd[0] && v <= r.pd[1];
  if (inH && inP) return "both";
  if (inH) return "healthy";
  if (inP) return "pd";
  return "neither";
}

export function ParkinsonsDebugPanel({
  features,
  live,
}: {
  features: FeatureBag;
  live: boolean;
}) {
  const keys = Object.keys(FEATURE_RANGES);

  return (
    <div className="debug" style={{ marginTop: 16 }}>
      <h4>
        {live && <span className="pulse" />}
        Feature values vs training ranges
      </h4>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Ranges are [p1, p99] from the training split.
        <span style={{ color: "var(--green)", marginLeft: 8 }}>■ healthy</span>
        <span style={{ color: "var(--red)", marginLeft: 8 }}>■ PD</span>
        <span style={{ color: "var(--yellow)", marginLeft: 8 }}>■ outside both (amber = out-of-distribution)</span>
      </p>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 0.8fr 1fr 1fr",
        gap: "3px 10px",
        fontFamily: "var(--mono)",
        fontSize: 12,
      }}>
        {/* Header */}
        <span className="muted" style={{ fontWeight: 700 }}>Feature</span>
        <span className="muted" style={{ fontWeight: 700 }}>Value</span>
        <span className="muted" style={{ fontWeight: 700 }}>Healthy p1–p99</span>
        <span className="muted" style={{ fontWeight: 700 }}>PD p1–p99</span>

        {keys.map((k) => {
          const v = features[k];
          const r = FEATURE_RANGES[k];
          const num = typeof v === "number" && Number.isFinite(v) ? v : null;
          const zone = num !== null ? classify(num, r) : null;

          let valueColor = "var(--text)";
          if (zone === "healthy") valueColor = "var(--green)";
          else if (zone === "pd") valueColor = "var(--red)";
          else if (zone === "neither") valueColor = "var(--yellow)";
          else if (zone === "both") valueColor = "var(--muted)";

          return [
            <span key={`${k}-name`} className="muted">{k}</span>,
            <span key={`${k}-val`} style={{ color: valueColor, fontWeight: zone === "neither" ? 700 : 400 }}>
              {v === null || v === undefined ? "—" : fmt(v)}
              {zone === "neither" && " ⚠"}
            </span>,
            <span key={`${k}-h`} style={{ color: "var(--muted)" }}>{fmtRange(r.healthy)}</span>,
            <span key={`${k}-pd`} style={{ color: "var(--muted)" }}>{fmtRange(r.pd)}</span>,
          ];
        })}

        {/* Extra features not in the range table (e.g. pd_probability) */}
        {Object.keys(features)
          .filter((k) => !FEATURE_RANGES[k])
          .map((k) => [
            <span key={`${k}-name`} className="muted">{k}</span>,
            <span key={`${k}-val`}>{fmt(features[k])}</span>,
            <span key={`${k}-h`} />,
            <span key={`${k}-pd`} />,
          ])}
      </div>
    </div>
  );
}
