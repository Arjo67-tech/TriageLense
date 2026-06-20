// ──────────────────────────────────────────────────────────
//  Shared MediaPipe Tasks-Vision loader.
//  Browser-only. The wasm fileset + .task models are pulled from
//  the public Google CDN so there is no build-time wasm bundling.
// ──────────────────────────────────────────────────────────
import { FilesetResolver } from "@mediapipe/tasks-vision";

export type { Landmark } from "./indices";

const WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

export const MODEL_URLS = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
} as const;

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null =
  null;

export function getFileset() {
  if (!filesetPromise) {
    filesetPromise = FilesetResolver.forVisionTasks(WASM);
  }
  return filesetPromise;
}
