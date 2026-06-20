import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TriageLens — Camera-based triage screening",
  description: "A futuristic interface for guided, camera-based health screening.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
