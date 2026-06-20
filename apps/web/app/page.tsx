import Link from "next/link";
import { EXAMS, MODULE_ORDER } from "@/lib/exams";

export default function Home() {
  return (
    <main>
      <div className="disclaimer">
        <b>Not a medical device.</b> TriageLens is an experimental screening
        demo. It cannot diagnose anything. In an emergency call your local
        emergency number (911/112/999) immediately.
      </div>
      <h1>TriageLens</h1>
      <p className="sub">
        Live, feature-based triage screening. Each exam extracts real signals
        from your camera, microphone and answers — and tells you when it
        cannot assess something reliably.
      </p>
      <div className="grid">
        {MODULE_ORDER.map((id) => {
          const ex = EXAMS[id];
          return (
            <Link key={id} href={`/exam/${id}`} className="card link">
              <h3>{ex.title}</h3>
              <p>{ex.blurb}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
