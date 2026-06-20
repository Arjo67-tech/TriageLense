import type { Landmark } from "@/lib/mediapipe/loader";

/** Lightweight landmark overlay so the user can see tracking is live. */
export function drawPoints(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  pointSets: Landmark[][],
  color = "rgba(91,140,255,.9)",
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = video.videoWidth || canvas.clientWidth;
  canvas.height = video.videoHeight || canvas.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  for (const set of pointSets) {
    if (!set) continue;
    for (const p of set) {
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}
