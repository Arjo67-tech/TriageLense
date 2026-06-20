import Link from "next/link";
import { DISEASES } from "@/lib/diseases/registry";

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
        ML-based degenerative disease screening. Each module runs a trained
        model on real acoustic or movement features — and tells you when it
        cannot assess something reliably.
      </p>
      <div className="grid">
        {DISEASES.map((d) =>
          d.available ? (
            <Link key={d.id} href={d.href} className="card link">
              <h3>{d.title}</h3>
              <p>{d.blurb}</p>
            </Link>
          ) : (
            <div key={d.id} className="card disabled">
              <h3>{d.title}</h3>
              <p>{d.blurb}</p>
            </div>
          ),
        )}
      </div>
    </main>
  );
}
