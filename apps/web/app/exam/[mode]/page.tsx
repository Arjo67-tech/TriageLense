import { notFound } from "next/navigation";
import { EXAMS } from "@/lib/exams";
import type { ModuleId } from "@/lib/types";
import { ExamRunner } from "@/components/ExamRunner";

export function generateStaticParams() {
  return Object.keys(EXAMS).map((mode) => ({ mode }));
}

export default function ExamPage({ params }: { params: { mode: string } }) {
  const config = EXAMS[params.mode as ModuleId];
  if (!config) notFound();
  return <ExamRunner config={config} />;
}
