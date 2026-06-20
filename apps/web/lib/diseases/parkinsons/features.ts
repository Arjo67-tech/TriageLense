/**
 * UCI Parkinson's voice feature names — must match the order exported by train.py.
 * These are Praat acoustic measures; they cannot be reliably extracted in real-time
 * from browser audio (no Praat, no pitch period extraction). v1 runs on dataset
 * samples only. Live mic input is flagged as "uncertain" — never faked as normal.
 */
// Shimmer features dropped — amplitude perturbation inflated by Opus/consumer mics.
export const PARKINSON_FEATURE_NAMES = [
  "MDVP:Fo(Hz)", "MDVP:Fhi(Hz)", "MDVP:Flo(Hz)",
  "MDVP:Jitter(Abs)", "MDVP:RAP", "MDVP:PPQ", "Jitter:DDP",
  "NHR", "HNR",
] as const;

export type ParkinsonsFeatureVector = number[];

/**
 * Validate that a feature vector has the right length and finite values.
 * Returns quality 0..1: 1.0 if all 22 features present and finite, lower otherwise.
 */
export function vectorQuality(v: number[]): number {
  if (v.length !== PARKINSON_FEATURE_NAMES.length) return 0;
  const finite = v.filter(Number.isFinite).length;
  return finite / PARKINSON_FEATURE_NAMES.length;
}

/** Shape returned by the FastAPI /analyze/parkinsons endpoint. */
export interface ServiceResponse {
  probability: number;
  quality: { ok: boolean; reasons: string[] };
  features: Record<string, number | null>;
}

/** A real sample from the UCI dataset for UI demo purposes. */
export interface DatasetSample {
  name: string;
  features: ParkinsonsFeatureVector;
  trueLabel: 0 | 1; // 0=healthy, 1=Parkinson's
}

// Features: Fo, Fhi, Flo, Jitter(Abs), RAP, PPQ, DDP, NHR, HNR
export const DEMO_SAMPLES: DatasetSample[] = [
  { name: "phon_R01_S01_1 (PD)", trueLabel: 1,
    features: [119.992,157.302,74.997, 0.00007,0.0037,0.00554,0.01109, 0.02211,21.033] },
  { name: "phon_R01_S01_2 (PD)", trueLabel: 1,
    features: [122.4,148.65,113.819, 0.00008,0.00465,0.00696,0.01394, 0.01929,19.085] },
  { name: "phon_R01_S01_3 (PD)", trueLabel: 1,
    features: [116.682,131.111,111.555, 0.00009,0.00544,0.00781,0.01633, 0.01309,20.651] },
  { name: "phon_R01_S04_1 (PD)", trueLabel: 1,
    features: [197.076,206.896,192.055, 0.00001,0.00166,0.00168,0.00498, 0.00339,26.775] },
  { name: "phon_R01_S05_1 (PD)", trueLabel: 1,
    features: [240.476,243.014,203.432, 0.00002,0.00185,0.00241,0.00555, 0.02444,21.209] },
  { name: "phon_R01_S06_1 (healthy)", trueLabel: 0,
    features: [174.188,230.978,94.261, 0.00003,0.00263,0.00259,0.00790, 0.01015,23.482] },
  { name: "phon_R01_S06_2 (healthy)", trueLabel: 0,
    features: [160.612,228.241,100.401, 0.00003,0.00265,0.00272,0.00796, 0.01458,22.085] },
  { name: "phon_R01_S07_1 (healthy)", trueLabel: 0,
    features: [197.076,206.896,192.055, 0.00001,0.00083,0.00088,0.00249, 0.00740,25.292] },
  { name: "phon_R01_S07_2 (healthy)", trueLabel: 0,
    features: [206.900,212.900,200.100, 0.00001,0.00080,0.00085,0.00240, 0.00680,25.800] },
  { name: "phon_R01_S08_1 (healthy)", trueLabel: 0,
    features: [174.688,200.0,143.556, 0.00002,0.00183,0.00174,0.00549, 0.01007,23.067] },
];
