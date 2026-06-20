"use client";
import type { CheckItem } from "@/lib/checklists";

export function Checklist({
  items,
  value,
  onChange,
}: {
  items: CheckItem[];
  value: Record<string, boolean | number | string>;
  onChange: (v: Record<string, boolean | number | string>) => void;
}) {
  return (
    <div className="checklist">
      {items.map((it) =>
        it.numeric ? (
          <label key={it.id} className="qa">
            <span style={{ display: "block", marginBottom: 4 }}>{it.label}</span>
            <input
              type="text"
              inputMode="decimal"
              value={(value[it.id] as string) ?? ""}
              placeholder="e.g. 40 or 104"
              onChange={(e) => {
                const raw = e.target.value.trim();
                const n = parseFloat(raw);
                onChange({
                  ...value,
                  [it.id]: raw === "" ? "" : Number.isFinite(n) ? n : raw,
                });
              }}
            />
          </label>
        ) : (
          <label key={it.id}>
            <input
              type="checkbox"
              checked={
                value[it.id] === undefined ? !!it.defaultOn : value[it.id] === true
              }
              onChange={(e) => onChange({ ...value, [it.id]: e.target.checked })}
            />
            <span>{it.label}</span>
          </label>
        ),
      )}
    </div>
  );
}
