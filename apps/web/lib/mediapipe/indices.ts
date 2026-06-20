// ──────────────────────────────────────────────────────────
//  Landmark type + index constants.
//  Dependency-free (no @mediapipe import) so the extractors and
//  tests can use it without pulling in the browser-only package.
// ──────────────────────────────────────────────────────────
export type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

// MediaPipe FaceMesh indices.
export const FACE = {
  NOSE_TIP: 1,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  UPPER_LIP: 13,
  LOWER_LIP: 14,
  LEFT_EYE_OUTER: 33,
  RIGHT_EYE_OUTER: 263,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_INNER: 362,
  LEFT_IRIS: 468,
  RIGHT_IRIS: 473,
  CHIN: 152,
  FOREHEAD: 10,
} as const;

// BlazePose 33-point indices.
export const POSE = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
} as const;

// MediaPipe Hands 21-point indices.
export const HAND = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
} as const;
