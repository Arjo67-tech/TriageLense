"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildOrientationQuestions,
  type OrientationAnswer,
} from "@/lib/extract/questions";

export function OrientationQA({
  onChange,
}: {
  onChange: (answers: OrientationAnswer[]) => void;
}) {
  const questions = useMemo(() => buildOrientationQuestions(), []);
  const startRef = useRef(performance.now());
  const latencyRef = useRef<Record<string, number>>({});
  const [given, setGiven] = useState<Record<string, string>>({});

  useEffect(() => {
    startRef.current = performance.now();
  }, []);

  const emit = (next: Record<string, string>) => {
    const answers: OrientationAnswer[] = questions.map((q) => ({
      id: q.id,
      given: next[q.id] ?? "",
      expected: q.expected,
      latencyMs: latencyRef.current[q.id] ?? 0,
    }));
    onChange(answers);
  };

  return (
    <div className="checklist">
      {questions.map((q) => (
        <label key={q.id} className="qa">
          <span style={{ display: "block", marginBottom: 4 }}>{q.prompt}</span>
          <input
            type="text"
            value={given[q.id] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!latencyRef.current[q.id] && v.trim().length > 0) {
                latencyRef.current[q.id] = Math.round(
                  performance.now() - startRef.current,
                );
              }
              const next = { ...given, [q.id]: v };
              setGiven(next);
              emit(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}
