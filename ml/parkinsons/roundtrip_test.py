"""
Round-trip validation (§10): synthesize a 5s sustained /a/ vowel at the
Fo from row 0 of parkinsons.data, extract all 22 features, and diff against
the dataset row. Large diffs = domain shift; NaNs = broken extractor.

This is an honest canary test — a synthetic pure tone will NOT reproduce
the nonlinear features of a real dysphonic voice, so expect large diffs on
RPDE/DFA/D2/PPE. The goal is to prove the extractor runs without crashing
and Group-A features land in the right ballpark, not to match exactly.
"""

import math
import numpy as np
import pandas as pd
from extract import praat_voice_features, FEATURE_ORDER
from nonlinear import nonlinear_features

# ── Load dataset row 0 ───────────────────────────────────────────────────────
df = pd.read_csv("data/parkinsons.data")
row = df.iloc[0]
target = {k: float(row[k]) for k in FEATURE_ORDER}

SR = 44100
DURATION = 5.0
fo = target["MDVP:Fo(Hz)"]
print(f"Using row 0: {row['name']}  Fo={fo:.1f} Hz  status={int(row['status'])}\n")

# ── Synthesize a sustained vowel at Fo ───────────────────────────────────────
# Pure sine — will produce near-zero jitter/shimmer (unlike a real voice).
# This tests plumbing, not accuracy.
t = np.linspace(0, DURATION, int(SR * DURATION), endpoint=False)
# Add subtle amplitude modulation to give Praat something to measure
am = 1.0 + 0.02 * np.sin(2 * np.pi * 5 * t)   # 5 Hz shimmer-like AM
fm = fo + 0.5 * np.sin(2 * np.pi * 4 * t)       # 4 Hz vibrato-like FM
phase = 2 * np.pi * np.cumsum(fm) / SR
signal = (am * np.sin(phase)).astype(np.float64)
signal += np.random.default_rng(42).normal(0, 0.001, len(signal))  # tiny noise floor

# ── Extract features ─────────────────────────────────────────────────────────
extracted = praat_voice_features(signal, SR)

# ── Print diff table ─────────────────────────────────────────────────────────
print(f"{'Feature':<24} {'Dataset':>12} {'Extracted':>12} {'AbsDiff':>10}  {'Note'}")
print("-" * 80)

group_b = {"RPDE", "DFA", "spread1", "spread2", "D2", "PPE"}
all_ok = True
for k in FEATURE_ORDER:
    ds = target[k]
    ex = extracted.get(k, float("nan"))
    diff = abs(ex - ds) if (math.isfinite(ex) and math.isfinite(ds)) else float("nan")
    note = ""
    if k in group_b:
        note = "[Group-B nonlinear]"
    if not math.isfinite(ex):
        note += " ⚠ NaN"
        all_ok = False
    elif diff > ds * 2 and ds != 0:
        note += " ⚠ large diff"
    print(f"{k:<24} {ds:>12.5f} {ex:>12.5f} {diff:>10.5f}  {note}")

print()
if all_ok:
    print("✓ All 22 features extracted without NaN.")
else:
    print("⚠ Some features returned NaN — check extractor.")

print("\nNote: large diffs on Group-A jitter/shimmer are expected (pure sine ≠ real voice).")
print("Group-B diffs reflect synthetic signal vs dysphonic recording — expected large.")
print("Round-trip on REAL voice audio is required to validate Group-A pipeline accuracy.")
