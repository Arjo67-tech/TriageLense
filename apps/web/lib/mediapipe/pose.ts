import { PoseLandmarker } from "@mediapipe/tasks-vision";
import { getFileset, MODEL_URLS } from "./loader";
import { POSE, type Landmark } from "./indices";

export { POSE };

let landmarker: PoseLandmarker | null = null;
let loading: Promise<PoseLandmarker> | null = null;

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarker) return landmarker;
  if (!loading) {
    loading = (async () => {
      const fileset = await getFileset();
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URLS.pose, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      return landmarker;
    })();
  }
  return loading;
}

export function detectPose(
  lm: PoseLandmarker,
  video: HTMLVideoElement,
  ts: number,
): Landmark[] | null {
  const res = lm.detectForVideo(video, ts);
  return (res.landmarks?.[0] as Landmark[] | undefined) ?? null;
}

export function disposePose() {
  landmarker?.close();
  landmarker = null;
  loading = null;
}
