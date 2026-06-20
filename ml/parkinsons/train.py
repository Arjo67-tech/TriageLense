"""
Train Parkinson's voice classifier on UCI dataset (195 rows, 31 subjects).
Subject-level train/test split — never a random row split (avoids data leakage).

Usage:
    pip install pandas scikit-learn xgboost onnx skl2onnx
    python train.py

Outputs:
    model.onnx          — 14-feature ONNX model (Parselmouth-compatible subset)
    metrics.json        — accuracy, macro-F1, ROC-AUC, feature names
    feature_names.json  — ordered list of input features for the web app
"""

import json
import sys
import joblib
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

DATA_DIR = Path(__file__).parent / "data"
OUT_DIR = Path(__file__).parent

CSV_PATH = DATA_DIR / "parkinsons.data"

if not CSV_PATH.exists():
    sys.exit(
        f"ERROR: {CSV_PATH} not found.\n"
        "Download from https://archive.ics.uci.edu/static/public/174/parkinsons.zip "
        "and place parkinsons.data in ml/parkinsons/data/"
    )

df = pd.read_csv(CSV_PATH)

# The 'name' column encodes the subject: "phon_R01_S01_1" -> subject R01_S01
df["subject"] = df["name"].str.extract(r"(R\d+_S\d+)")

TARGET = "status"
DROP = ["name", "subject", TARGET]

# Option 3 (§5): drop features where Parselmouth diverges from MDVP numerically.
# MDVP:Jitter(%) — Praat reports ~13× larger values (§0.2 covariate shift).
# Group-B nonlinear features — our implementations yield different ranges than
# the original Little et al. pipeline. Re-add after Option 1 retraining.
# Drop shimmer features — amplitude perturbation is heavily inflated by Opus/consumer mics.
# Keep frequency + jitter (timing-based, codec-robust) + noise ratios.
SHIFTED = {
    "MDVP:Jitter(%)", "RPDE", "DFA", "spread1", "spread2", "D2", "PPE",
    "MDVP:Shimmer", "MDVP:Shimmer(dB)", "Shimmer:APQ3", "Shimmer:APQ5",
    "MDVP:APQ", "Shimmer:DDA",
}
FEATURES = [c for c in df.columns if c not in DROP and c not in SHIFTED]

X = df[FEATURES].values.astype(np.float32)
y = df[TARGET].values
groups = df["subject"].values

# Subject-level 80/20 split
gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
train_idx, test_idx = next(gss.split(X, y, groups=groups))

X_train, X_test = X[train_idx], X[test_idx]
y_train, y_test = y[train_idx], y[test_idx]

pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", GradientBoostingClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )),
])

pipe.fit(X_train, y_train)

y_pred = pipe.predict(X_test)
y_prob = pipe.predict_proba(X_test)[:, 1]

metrics = {
    "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
    "macro_f1": round(float(f1_score(y_test, y_pred, average="macro")), 4),
    "roc_auc": round(float(roc_auc_score(y_test, y_prob)), 4),
    "n_train": int(len(X_train)),
    "n_test": int(len(X_test)),
    "n_subjects_train": int(len(set(groups[train_idx]))),
    "n_subjects_test": int(len(set(groups[test_idx]))),
    "feature_names": FEATURES,
}

(OUT_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))
(OUT_DIR / "feature_names.json").write_text(json.dumps(FEATURES, indent=2))
joblib.dump(pipe, OUT_DIR / "model.joblib")

print(f"Accuracy : {metrics['accuracy']:.4f}")
print(f"Macro-F1 : {metrics['macro_f1']:.4f}")
print(f"ROC-AUC  : {metrics['roc_auc']:.4f}")
print(f"Train: {metrics['n_train']} rows / {metrics['n_subjects_train']} subjects")
print(f"Test : {metrics['n_test']} rows / {metrics['n_subjects_test']} subjects")

# Export to ONNX (float32 input, 22 features)
n_features = len(FEATURES)
initial_type = [("float_input", FloatTensorType([None, n_features]))]
onnx_model = convert_sklearn(
    pipe,
    initial_types=initial_type,
    target_opset=17,
    options={"zipmap": False},  # export probabilities as float32 tensor, not Sequence<Map>
)
(OUT_DIR / "model.onnx").write_bytes(onnx_model.SerializeToString())
print(f"Saved model.onnx ({(OUT_DIR / 'model.onnx').stat().st_size // 1024} KB)")
print("Done.")
