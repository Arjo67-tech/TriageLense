"use client";
import type { FeatureBag, FeatureValue } from "@/lib/types";

function fmt(v: FeatureValue): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "∞";
    return Math.abs(v) >= 100 || Number.isInteger(v)
      ? String(Math.round(v))
      : v.toFixed(3);
  }
  return String(v);
}

export function DebugPanel({
  features,
  live,
}: {
  features: FeatureBag;
  live: boolean;
}) {
  const keys = Object.keys(features).sort();
  return (
    <div className="debug">
      <h4>
        {live && <span className="pulse" />}
        Live feature values
      </h4>
      {keys.length === 0 ? (
        <p className="muted">No features yet — start a step to see live values.</p>
      ) : (
        <div className="kv">
          {keys.map((k) => {
            const v = features[k];
            let cls = "v";
            if (k.endsWith("_quality") && typeof v === "number") {
              cls += v < 0.35 ? " bad" : v < 0.6 ? " warn" : " ok";
            }
            return (
              <div key={k} style={{ display: "contents" }}>
                <span className="k">{k}</span>
                <span className={cls}>{fmt(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
