"""
Group-A Parselmouth feature extraction + quality gate.
Nonlinear Group-B features (RPDE, DFA, D2, spread1, spread2, PPE) are stubbed
as NaN until Step 2. Any NaN → quality gate fails → result is uncertain.

Mapping notes (§4a caveats):
- MDVP:Jitter(%) = Praat local jitter × 100 (Praat returns fraction, dataset is %)
- MDVP:PPQ  ↔ Praat ppq5   (conventional mapping, not exact MDVP equivalent)
- MDVP:APQ  ↔ Praat apq11  (conventional mapping, not exact MDVP equivalent)
- NHR: approximated from HNR via 1/10^(HNR/10); the dataset's NHR is its own measure
- All Praat jitter/shimmer values may differ numerically from MDVP (§0.2 covariate shift)
"""

import math
import numpy as np
import parselmouth
from parselmouth.praat import call
# nonlinear import removed — Group-B features dropped in Option 3 (§5)


# Option 3 subset — features where Parselmouth agrees with MDVP numerically.
# Dropped: MDVP:Jitter(%), RPDE, DFA, spread1, spread2, D2, PPE (domain shift).
FEATURE_ORDER = [
    "MDVP:Fo(Hz)", "MDVP:Fhi(Hz)", "MDVP:Flo(Hz)",
    "MDVP:Jitter(Abs)", "MDVP:RAP", "MDVP:PPQ", "Jitter:DDP",
    "NHR", "HNR",
]

F0_MIN = 75.0
F0_MAX = 500.0


def praat_voice_features(signal: np.ndarray, sr: int) -> dict:
    """Group-A: 16 frequency/perturbation/noise features via Parselmouth."""
    snd = parselmouth.Sound(signal.astype(np.float64), sampling_frequency=sr)
    pitch = snd.to_pitch(pitch_floor=F0_MIN, pitch_ceiling=F0_MAX)
    pp = call(snd, "To PointProcess (periodic, cc)", F0_MIN, F0_MAX)

    def safe_call(*args, **kwargs):
        try:
            v = call(*args, **kwargs)
            return float(v) if v is not None else float("nan")
        except Exception:
            return float("nan")

    fo  = safe_call(pitch, "Get mean", 0, 0, "Hertz")
    fhi = safe_call(pitch, "Get maximum", 0, 0, "Hertz", "Parabolic")
    flo = safe_call(pitch, "Get minimum", 0, 0, "Hertz", "Parabolic")

    jit_local = safe_call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
    jit_abs   = safe_call(pp, "Get jitter (local, absolute)", 0, 0, 0.0001, 0.02, 1.3)
    rap       = safe_call(pp, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3)
    ppq5      = safe_call(pp, "Get jitter (ppq5)", 0, 0, 0.0001, 0.02, 1.3)
    ddp       = safe_call(pp, "Get jitter (ddp)", 0, 0, 0.0001, 0.02, 1.3)

    shim_local = safe_call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shim_db    = safe_call([snd, pp], "Get shimmer (local_dB)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    apq3       = safe_call([snd, pp], "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    apq5       = safe_call([snd, pp], "Get shimmer (apq5)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    apq11      = safe_call([snd, pp], "Get shimmer (apq11)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    dda        = safe_call([snd, pp], "Get shimmer (dda)", 0, 0, 0.0001, 0.02, 1.3, 1.6)

    harm = call(snd, "To Harmonicity (cc)", 0.01, F0_MIN, 0.1, 1.0)
    hnr  = safe_call(harm, "Get mean", 0, 0)
    # NHR approximation: noise-to-harmonics ratio from HNR (dB)
    nhr  = (1.0 / (10 ** (hnr / 10))) if math.isfinite(hnr) and hnr > 0 else float("nan")

    return {
        "MDVP:Fo(Hz)":       fo,
        "MDVP:Fhi(Hz)":      fhi,
        "MDVP:Flo(Hz)":      flo,
        "MDVP:Jitter(%)":    jit_local * 100 if math.isfinite(jit_local) else float("nan"),
        "MDVP:Jitter(Abs)":  jit_abs,
        "MDVP:RAP":          rap,
        "MDVP:PPQ":          ppq5,
        "Jitter:DDP":        ddp,
        "MDVP:Shimmer":      shim_local,
        "MDVP:Shimmer(dB)":  shim_db,
        "Shimmer:APQ3":      apq3,
        "Shimmer:APQ5":      apq5,
        "MDVP:APQ":          apq11,
        "Shimmer:DDA":       dda,
        "NHR":               nhr,
        "HNR":               hnr,
    }


# ── Training-set per-feature [p1, p99] for out-of-distribution check ─────────
# Derived from parkinsons.data; update after retraining on your own extractor.
# [p1, p99] from the actual subject-level training split (GroupShuffleSplit seed=42).
# Group-B bounds will be updated after round-trip validation on real voice audio.
TRAINING_RANGES = {
    "MDVP:Fo(Hz)":  (93.51152,  248.91305),
    "MDVP:Fhi(Hz)": (105.0641,  538.79275),
    "MDVP:Flo(Hz)": (65.76632,  234.8448),
    "NHR":          (0.00096,   0.212451),
    "HNR":          (11.12905,  32.19848),
}


def duration_voiced(signal: np.ndarray, sr: int) -> float:
    """Seconds of roughly voiced signal (RMS > 1% of max)."""
    frame = int(sr * 0.02)
    rms_max = 0.0
    frames = []
    for i in range(0, len(signal) - frame, frame):
        r = float(np.sqrt(np.mean(signal[i:i+frame] ** 2)))
        frames.append(r)
        rms_max = max(rms_max, r)
    if rms_max == 0:
        return 0.0
    voiced = sum(1 for r in frames if r > 0.01 * rms_max)
    return voiced * 0.02


def voiced_fraction(signal: np.ndarray, sr: int) -> float:
    frame = int(sr * 0.02)
    total, voiced = 0, 0
    rms_vals = []
    for i in range(0, len(signal) - frame, frame):
        rms_vals.append(float(np.sqrt(np.mean(signal[i:i+frame] ** 2))))
        total += 1
    if total == 0:
        return 0.0
    threshold = max(rms_vals) * 0.01
    voiced = sum(1 for r in rms_vals if r > threshold)
    return voiced / total


def clipping_ratio(signal: np.ndarray) -> float:
    return float(np.mean(np.abs(signal) >= 0.999))


def snr_estimate(signal: np.ndarray, sr: int) -> float:
    """Rough SNR: ratio of voiced-frame RMS to silent-frame RMS (dB)."""
    frame = int(sr * 0.02)
    rms_vals = []
    for i in range(0, len(signal) - frame, frame):
        rms_vals.append(float(np.sqrt(np.mean(signal[i:i+frame] ** 2))))
    if not rms_vals:
        return 0.0
    rms_sorted = sorted(rms_vals)
    noise_rms = max(np.mean(rms_sorted[:max(1, len(rms_sorted)//5)]), 1e-10)
    signal_rms = max(np.mean(rms_sorted[-max(1, len(rms_sorted)//5):]), 1e-10)
    return 20 * math.log10(signal_rms / noise_rms)


def out_of_training_range(feats: dict) -> list:
    """
    Returns list of feature names that fall outside [p1, p99] of training data.

    Known domain-shifted features are excluded from this check:
    - MDVP:Jitter(%) — Praat reports ~13× larger values than MDVP (§0.2 covariate shift)
    - DFA, spread1    — our implementations yield different ranges than the Little pipeline
    These will be re-included after retraining on Parselmouth-extracted features (§5 Option 1).
    """
    # All Group-B nonlinear features are skipped: our Parselmouth/scipy implementations
    # yield different numeric ranges than the original Little et al. pipeline the model
    # was trained on. Re-enable after retraining on Parselmouth-extracted features (§5 Option 1).
    # MDVP:Jitter(%) is also skipped: Praat reports ~13× larger values than MDVP (§0.2).
    SKIP: set = set()  # all 5 FEATURE_ORDER features are reliable for running speech
    oob = []
    for k, (lo, hi) in TRAINING_RANGES.items():
        if k in SKIP:
            continue
        v = feats.get(k, float("nan"))
        if math.isfinite(v) and not (lo <= v <= hi):
            oob.append(k)
    return oob


def quality_verdict(signal: np.ndarray, sr: int, feats: dict) -> dict:
    """Returns {"ok": bool, "reasons": [str]}. Simple gate: length, clipping, NaN only."""
    reasons = []
    if duration_voiced(signal, sr) < 3.0:
        reasons.append("too_short")
    if clipping_ratio(signal) > 0.005:
        reasons.append("clipping")
    if any(not math.isfinite(feats.get(k, float("nan"))) for k in FEATURE_ORDER):
        reasons.append("nan_in_features")
    return {"ok": len(reasons) == 0, "reasons": reasons}
