"""
FastAPI voice analysis service for Parkinson's screening.
Single file. Run with: uvicorn serve:app --reload --port 8000

POST /analyze/parkinsons  multipart: file=<wav/webm audio>
Returns JSON matching what analyze.ts expects:
  { probability, quality: {ok, reasons}, features: {<22 keys>} }

Domain-shift disclaimer: Group-A features are computed by Parselmouth (Praat),
not MDVP. Numeric values will differ from the training set. Until the model is
retrained on Parselmouth-extracted features (§5 Option 1), every live result
is gated to uncertain. Group-B nonlinear features are NaN stubs until Step 2.
"""

import io
import joblib
import math
import numpy as np
import soundfile as sf
from pathlib import Path
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from scipy.signal import resample_poly

from extract import praat_voice_features, quality_verdict, FEATURE_ORDER  # 15-feature Option 3 subset

app = FastAPI(title="TriageLens Parkinson's Voice Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

_MODEL_PATH = Path(__file__).parent / "model.joblib"
_model = None


def get_model():
    global _model
    if _model is None:
        if not _MODEL_PATH.exists():
            raise RuntimeError(
                "model.joblib not found — run train.py (it saves both model.onnx and model.joblib)"
            )
        _model = joblib.load(_MODEL_PATH)
    return _model


@app.post("/analyze/parkinsons")
async def analyze(file: UploadFile):
    # ── 1. Decode audio ──────────────────────────────────────
    raw = await file.read()
    try:
        signal, sr = sf.read(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not decode audio: {e}")

    if signal.ndim > 1:
        signal = signal.mean(axis=1)
    signal = signal.astype(np.float64)

    # ── 2. Extract Group-A features (Group-B stubs are NaN) ──
    feats = praat_voice_features(signal, sr)

    # ── 3. Quality gate ──────────────────────────────────────
    quality = quality_verdict(signal, sr, feats)

    # ── 4. Run model (always; gate controls whether we trust it) ─
    probability = 0.5  # default when model can't run
    try:
        model = get_model()
        x = np.array([[feats.get(k, float("nan")) for k in FEATURE_ORDER]])
        if np.all(np.isfinite(x)):
            probability = float(model.predict_proba(x)[0, 1])
    except Exception:
        pass  # probability stays 0.5 — gate will mark uncertain anyway

    return {
        "probability": probability,
        "quality": quality,
        "features": {k: (v if math.isfinite(v) else None) for k, v in feats.items()
                     if k in FEATURE_ORDER},
    }


@app.get("/health")
def health():
    return {"status": "ok"}
