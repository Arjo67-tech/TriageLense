import { HandLandmarker } from "@mediapipe/tasks-vision";
import { getFileset, MODEL_URLS } from "./loader";
import { HAND, type Landmark } from "./indices";

export { HAND };

export interface HandFrame {
  /** detected hands with their handedness label */
  hands: { landmarks: Landmark[]; handedness: "Left" | "Right" }[];
}

let landmarker: HandLandmarker | null = null;
let loading: Promise<HandLandmarker> | null = null;

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (landmarker) return landmarker;
  if (!loading) {
    loading = (async () => {
      const fileset = await getFileset();
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URLS.hand, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
      return landmarker;
    })();
  }
  return loading;
}

export function detectHands(
  lm: HandLandmarker,
  video: HTMLVideoElement,
  ts: number,
): HandFrame {
  const res = lm.detectForVideo(video, ts);
  const out: HandFrame["hands"] = [];
  const sets = res.landmarks ?? [];
  for (let i = 0; i < sets.length; i++) {
    // handedness is from the camera's POV; the image is mirrored for display
    // but raw landmark coords are not, so the label is consistent for asymmetry.
    const label =
      (res.handedness?.[i]?.[0]?.categoryName as "Left" | "Right") ?? "Right";
    out.push({ landmarks: sets[i] as Landmark[], handedness: label });
  }
  return { hands: out };
}

export function disposeHands() {
  landmarker?.close();
  landmarker = null;
  loading = null;
}
