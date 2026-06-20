// ──────────────────────────────────────────────────────────
//  Face-symmetry / smile extractor (stroke face step).
//  Produces: face_asymmetry_score, mouth_corner_y_difference,
//  smile_activation_left/right, face_quality.
// ──────────────────────────────────────────────────────────
import type { FeatureBag } from "../types";
import type { FaceFrame } from "../mediapipe/face";
import { FACE } from "../mediapipe/indices";
import { clamp01, dist } from "./signal";

export class FaceExtractor {
  private frames = 0;
  private faceFrames = 0;
  private maxSmileL = 0;
  private maxSmileR = 0;
  private bestSmileSum = -1;
  private cornerDiffAtBestSmile = 0;
  private cornerDiffMax = 0;

  reset() {
    this.frames = 0;
    this.faceFrames = 0;
    this.maxSmileL = 0;
    this.maxSmileR = 0;
    this.bestSmileSum = -1;
    this.cornerDiffAtBestSmile = 0;
    this.cornerDiffMax = 0;
  }

  push(frame: FaceFrame) {
    this.frames++;
    const lm = frame.landmarks;
    if (!lm || lm.length < 468) return;
    this.faceFrames++;

    const faceH = dist(lm[FACE.FOREHEAD], lm[FACE.CHIN]) || 1e-6;
    const eyeMidY = (lm[FACE.LEFT_EYE_INNER].y + lm[FACE.RIGHT_EYE_INNER].y) / 2;
    const leftRel = (lm[FACE.MOUTH_LEFT].y - eyeMidY) / faceH;
    const rightRel = (lm[FACE.MOUTH_RIGHT].y - eyeMidY) / faceH;
    const cornerDiff = Math.abs(leftRel - rightRel);
    this.cornerDiffMax = Math.max(this.cornerDiffMax, cornerDiff);

    const sL = frame.blendshapes["mouthSmileLeft"] ?? 0;
    const sR = frame.blendshapes["mouthSmileRight"] ?? 0;
    this.maxSmileL = Math.max(this.maxSmileL, sL);
    this.maxSmileR = Math.max(this.maxSmileR, sR);

    // Capture mouth asymmetry at the moment of strongest smile effort —
    // that's when a unilateral droop is most revealing.
    const sum = sL + sR;
    if (sum > this.bestSmileSum) {
      this.bestSmileSum = sum;
      this.cornerDiffAtBestSmile = cornerDiff;
    }
  }

  snapshot(): FeatureBag {
    const visibility = this.frames ? this.faceFrames / this.frames : 0;
    const enough = this.faceFrames >= 8;
    const quality = enough ? clamp01(visibility) : clamp01(visibility * 0.5);

    const cornerDiff = this.cornerDiffAtBestSmile || this.cornerDiffMax;
    const smileDiff = Math.abs(this.maxSmileL - this.maxSmileR);
    // Composite asymmetry: vertical mouth-corner mismatch + smile-activation
    // mismatch, each normalized to its abnormal threshold.
    const composite = clamp01(
      (cornerDiff / 0.045) * 0.6 + (smileDiff / 0.35) * 0.4,
    );

    return {
      face_asymmetry_score: composite,
      mouth_corner_y_difference: cornerDiff,
      smile_activation_left: this.maxSmileL,
      smile_activation_right: this.maxSmileR,
      face_visible_ratio: visibility,
      face_frames: this.faceFrames,
      face_quality: quality,
    };
  }
}
