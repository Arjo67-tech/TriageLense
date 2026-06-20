import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TriageLens",
  description:
    "Live, camera/microphone-based triage screening. Not a medical device.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
