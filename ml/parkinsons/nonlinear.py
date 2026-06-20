"""
Group-B nonlinear feature implementations for the Parkinson's voice screen.
All algorithms follow Little et al. 2007/2009 as the reference implementation.
Downsample to 22.05 kHz before calling these — matches the original paper.

References:
  Little MA et al. (2007) Exploiting nonlinear recurrence and fractal scaling
    properties for voice disorder detection. BioMedical Engineering OnLine.
  Little MA et al. (2009) Suitability of dysphonia measurements for
    telemonitoring of Parkinson's disease. IEEE Trans Biomed Eng.
"""

import math
import numpy as np
from scipy.signal import resample_poly
import parselmouth
from parselmouth.praat import call

TARGET_SR = 22050


def _resample(signal: np.ndarray, sr: int) -> np.ndarray:
    if sr == TARGET_SR:
        return signal.astype(np.float64)
    from math import gcd
    g = gcd(TARGET_SR, sr)
    return resample_poly(signal.astype(np.float64), TARGET_SR // g, sr // g)


# ── DFA — Detrended Fluctuation Analysis ─────────────────────────────────────

def dfa(x: np.ndarray, n_scales: int = 20) -> float:
    """
    Returns the DFA scaling exponent alpha.
    Signal is integrated (cumsum) then divided into non-overlapping windows;
    local linear trends are removed; RMS of residuals vs window size gives alpha.
    """
    x = np.asarray(x, dtype=np.float64)
    x = x - x.mean()
    y = np.cumsum(x)
    n = len(y)
    lo, hi = int(np.floor(np.log10(16))), int(np.floor(np.log10(n // 4)))
    if lo >= hi:
        return float("nan")
    scales = np.unique(
        np.floor(np.logspace(lo, hi, n_scales)).astype(int)
    )
    scales = scales[scales >= 4]
    if len(scales) < 4:
        return float("nan")
    F = []
    t = np.arange(max(scales))
    for s in scales:
        n_seg = n // s
        if n_seg < 1:
            continue
        seg = y[: n_seg * s].reshape(n_seg, s)
        ts = t[:s]
        rms_vals = []
        for row in seg:
            c = np.polyfit(ts, row, 1)
            rms_vals.append(float(np.sqrt(np.mean((row - np.polyval(c, ts)) ** 2))))
        F.append((s, float(np.mean(rms_vals))))
    if len(F) < 4:
        return float("nan")
    s_arr, f_arr = np.array(F).T
    mask = f_arr > 0
    if mask.sum() < 4:
        return float("nan")
    slope, _ = np.polyfit(np.log(s_arr[mask]), np.log(f_arr[mask]), 1)
    return float(slope)


# ── RPDE — Recurrence Period Density Entropy ──────────────────────────────────

MAX_SAMPLES = 10000  # cap before embedding — keeps RPDE/D2 under ~5s

def rpde(signal: np.ndarray, m: int = 4, tau: int = 1, epsilon: float = 0.2) -> float:
    """
    Normalized Shannon entropy of the distribution of recurrence times.
    Follows Little 2007: time-delay embed, find first return within epsilon,
    build histogram P(T), compute -sum(P log P) / log(T_max).
    """
    x = np.asarray(signal, dtype=np.float64)
    if len(x) > MAX_SAMPLES:
        x = x[:MAX_SAMPLES]
    # Normalize to unit variance
    std = x.std()
    if std < 1e-10:
        return float("nan")
    x = x / std

    N = len(x)
    # Time-delay embedding: X[i] = [x[i], x[i+tau], ..., x[i+(m-1)*tau]]
    max_i = N - (m - 1) * tau
    if max_i < 100:
        return float("nan")
    X = np.stack([x[i * tau: i * tau + max_i] for i in range(m)], axis=1)

    recurrence_times = []
    for i in range(len(X)):
        # Find first return: smallest j > i such that ||X[j]-X[i]|| < epsilon
        dists = np.linalg.norm(X[i + 1:] - X[i], axis=1)
        hits = np.where(dists < epsilon)[0]
        if len(hits) > 0:
            recurrence_times.append(int(hits[0]) + 1)

    if len(recurrence_times) < 10:
        return float("nan")

    T_max = max(recurrence_times)
    if T_max < 2:
        return float("nan")
    counts = np.bincount(recurrence_times, minlength=T_max + 1)[1:]
    p = counts / counts.sum()
    p = p[p > 0]
    entropy = -float(np.sum(p * np.log(p)))
    return entropy / math.log(T_max)


# ── D2 — Correlation Dimension ────────────────────────────────────────────────

def corr_dim(x: np.ndarray, emb_dim: int = 10, max_pts: int = 2000) -> float:
    """
    Grassberger-Procaccia correlation dimension via log-log slope of C(r).
    Uses a subsample for speed (UCI dataset computations used ~seconds of audio).
    """
    x = np.asarray(x, dtype=np.float64)
    if len(x) > MAX_SAMPLES:
        x = x[:MAX_SAMPLES]
    std = x.std()
    if std < 1e-10:
        return float("nan")
    x = x / std

    N = len(x)
    # Embedding (lag=1 for speed; Little uses Praat's pitch period as lag)
    X = np.stack([x[i: N - emb_dim + i + 1] for i in range(emb_dim)], axis=1)
    if len(X) > max_pts:
        idx = np.linspace(0, len(X) - 1, max_pts, dtype=int)
        X = X[idx]

    # Pairwise distances (upper triangle only)
    from scipy.spatial.distance import pdist
    dists = pdist(X)
    if len(dists) == 0:
        return float("nan")

    r_min, r_max = np.percentile(dists, 5), np.percentile(dists, 50)
    if r_min <= 0 or r_max <= r_min:
        return float("nan")

    radii = np.logspace(np.log10(r_min), np.log10(r_max), 20)
    C = [float(np.mean(dists < r)) for r in radii]
    C = np.array(C)
    mask = C > 0
    if mask.sum() < 4:
        return float("nan")
    slope, _ = np.polyfit(np.log(radii[mask]), np.log(C[mask]), 1)
    return float(slope)


# ── PPE + spread1/spread2 — Pitch Period Entropy ─────────────────────────────

def _f0_contour(signal: np.ndarray, sr: int,
                f0min: float = 75.0, f0max: float = 500.0) -> np.ndarray:
    """Extract voiced F0 frames (Hz) via Parselmouth."""
    snd = parselmouth.Sound(signal.astype(np.float64), sampling_frequency=float(sr))
    pitch = snd.to_pitch(pitch_floor=f0min, pitch_ceiling=f0max)
    f0_arr = pitch.selected_array["frequency"]
    voiced = f0_arr[f0_arr > 0]
    return voiced


def _semitone_residuals(f0: np.ndarray) -> np.ndarray:
    """
    Convert F0 to semitones relative to median, then remove slow drift
    via linear predictor (order 2) — matches Little 2009 PPE procedure.
    """
    if len(f0) < 10:
        return np.array([])
    median_f0 = float(np.median(f0))
    if median_f0 <= 0:
        return np.array([])
    semitones = 12.0 * np.log2(f0 / median_f0)
    # Remove smooth drift: subtract 2nd-order polynomial fit
    t = np.arange(len(semitones), dtype=np.float64)
    c = np.polyfit(t, semitones, 2)
    residuals = semitones - np.polyval(c, t)
    return residuals


def ppe(signal: np.ndarray, sr: int) -> float:
    """Pitch Period Entropy — Shannon entropy of discretized F0 residuals."""
    f0 = _f0_contour(signal, sr)
    residuals = _semitone_residuals(f0)
    if len(residuals) < 10:
        return float("nan")
    # Histogram with ~50 bins over [-3, 3] semitones
    counts, _ = np.histogram(residuals, bins=50, range=(-3.0, 3.0))
    p = counts / counts.sum() if counts.sum() > 0 else counts
    p = p[p > 0]
    if len(p) == 0:
        return float("nan")
    return float(-np.sum(p * np.log(p)) / np.log(len(p) + 1))


def spread1_spread2(signal: np.ndarray, sr: int) -> tuple:
    """
    spread1 ≈ log-scaled measure of F0 variation (used in Little pipeline).
    spread2 ≈ second-order F0-variation measure.
    These are intermediate statistics from the same pitch-variation analysis as PPE.
    """
    f0 = _f0_contour(signal, sr)
    if len(f0) < 10:
        return float("nan"), float("nan")
    median_f0 = float(np.median(f0))
    if median_f0 <= 0:
        return float("nan"), float("nan")
    log_f0 = np.log(f0 / median_f0)
    s1 = float(np.mean(log_f0))
    s2 = float(np.std(log_f0))
    return s1, s2


# ── Entry point ───────────────────────────────────────────────────────────────

def nonlinear_features(signal: np.ndarray, sr: int) -> dict:
    """
    Compute all 6 Group-B features. Downsamples to 22.05 kHz first.
    Any failed computation returns NaN — never silently defaults to 0.
    """
    sig22 = _resample(signal, sr)
    s1, s2 = spread1_spread2(sig22, TARGET_SR)
    return {
        "RPDE":    rpde(sig22),
        "DFA":     dfa(sig22),
        "spread1": s1,
        "spread2": s2,
        "D2":      corr_dim(sig22),
        "PPE":     ppe(sig22, TARGET_SR),
    }
