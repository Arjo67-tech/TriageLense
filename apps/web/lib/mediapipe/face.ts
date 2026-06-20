import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { getFileset, MODEL_URLS } from "./loader";
import { FACE, type Landmark } from "./indices";

export { FACE };

let landmarker: FaceLandmarker | null = null;
let loading: Promise<FaceLandmarker> | null = null;

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker;
  if (!loading) {
    loading = (async () => {
      const fileset = await getFileset();
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URLS.face, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
      return landmarker;
    })();
  }
  return loading;
}

export interface FaceFrame {
  landmarks: Landmark[] | null;
  /** blendshape categories keyed by name (0..1) — e.g. mouthSmileLeft. */
  blendshapes: Record<string, number>;
}

export function detectFace(
  lm: FaceLandmarker,
  video: HTMLVideoElement,
  ts: number,
): FaceFrame {
  const res = lm.detectForVideo(video, ts);
  const landmarks = (res.faceLandmarks?.[0] as Landmark[] | undefined) ?? null;
  const blendshapes: Record<string, number> = {};
  const cats = res.faceBlendshapes?.[0]?.categories ?? [];
  for (const c of cats) blendshapes[c.categoryName] = c.score;
  return { landmarks, blendshapes };
}

export function disposeFace() {
  landmarker?.close();
  landmarker = null;
  loading = null;
}
