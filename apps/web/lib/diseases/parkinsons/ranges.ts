/**
 * Per-feature [p1, p99] ranges for healthy and PD subjects,
 * derived from the training split (subject-level GroupShuffleSplit seed=42).
 * Used by ParkinsonsDebugPanel to highlight out-of-range values in amber.
 */
export interface FeatureRange {
  healthy: [number, number];
  pd: [number, number];
}

export const FEATURE_RANGES: Record<string, FeatureRange> = {
  "MDVP:Fo(Hz)":      { healthy: [111.3718,  257.4275],  pd: [92.3768,   216.06975] },
  "MDVP:Fhi(Hz)":     { healthy: [114.5931,  353.29815], pd: [103.1165,  572.51575] },
  "MDVP:Flo(Hz)":     { healthy: [74.50295,  238.51655], pd: [65.7548,   188.96655] },
  "MDVP:Jitter(Abs)": { healthy: [0.000008,  0.000066],  pd: [0.000012,  0.000209]  },
  "MDVP:RAP":         { healthy: [0.000924,  0.005771],  pd: [0.001163,  0.017497]  },
  "MDVP:PPQ":         { healthy: [0.001063,  0.005234],  pd: [0.001333,  0.014422]  },
  "Jitter:DDP":       { healthy: [0.002767,  0.017319],  pd: [0.003499,  0.052499]  },
  "NHR":              { healthy: [0.000674,  0.094928],  pd: [0.002349,  0.245521]  },
  "HNR":              { healthy: [18.28095,  32.91995],  pd: [10.67725,  26.8845]   },
};
