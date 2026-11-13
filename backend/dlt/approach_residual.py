"""
Residual-based ODE EWS IPS — detection engine.

Models each one-second feature vector as a point on the trajectory of a linear
dynamical system fitted from benign traffic (a data-driven ODE). Two physics-informed
residuals — a PINN residual and a Laplace residual — measure how far a second departs
from that learned dynamic; their sum is the anomaly score. No neural network is
trained: the system is re-fitted from the data at analysis time, and only the
benign-baseline score thresholds are stored per workflow.
"""
import logging
import pickle
from pathlib import Path

import numpy as np

from dlt import preprocessing as pp

logger = logging.getLogger("dlt.residual")

ID = "residual"
NAME = "Residual-based ODE EWS IPS"
DESCRIPTION = ("System-identification + PINN/Laplace residuals (NumPy only, no neural "
               "network). Robust, lightweight, and explainable.")
MODEL_SUBDIR = "residual"

# The system matrix is fitted by inverting an N-1 x NUM_FEATURES Gram matrix, so a
# run needs at least this many one-second bins before it can score.
MIN_SECONDS = pp.NUM_FEATURES + 1

# Each workflow scores against its own benign baseline and never the other's.
MODEL_SETS = {
    "LIVE": {"thresholds": "thresholds_VNRVJIET.pkl", "dataset": "VNRVJIET"},
    "CSV": {"thresholds": "thresholds_CICDDoS2019.pkl", "dataset": "CICDDoS2019"},
}


def resolve_model_set(mode):
    key = (mode or "").strip().upper()
    if key not in MODEL_SETS:
        raise ValueError(f"Unknown analysis mode {mode!r}. Expected one of {list(MODEL_SETS)}.")
    return key, MODEL_SETS[key]


def _residual_scores(df):
    """Per-second anomaly score (PINN + Laplace residual). Length len(df)-1: the
    last second has no forward difference and is left unscored."""
    n = len(df)
    Z = df[pp.FEATURES].values.astype(np.float64)   # (n, F)
    k = pp.NUM_FEATURES

    def fdiff(M):  # forward difference along the time axis
        if M.shape[0] == k:
            return np.column_stack([M[:, i + 1] - M[:, i] for i in range(n - 1)])
        return np.vstack([M[i + 1] - M[i] for i in range(n - 1)])

    Z_trim_t = Z[:-1, :].T                           # (F, n-1)
    Az = ((np.linalg.inv(Z_trim_t @ Z[:-1, :]) @ Z_trim_t @ fdiff(Z)).T)  # (F, F)
    r_pinn = np.sum(fdiff(Z.T) - Az @ Z_trim_t, axis=0)
    r_laplace = np.sum(Z_trim_t - ((np.eye(k) - Az) @ Z_trim_t), axis=0)
    return r_pinn + r_laplace


def run_test_only(test_df, results_folder, model_folder, mode="LIVE", allow_ungraded=False):
    """Score a dataset for the given workflow mode. With `allow_ungraded`, returns
    rows ungraded (so live traffic can show immediately) until there are enough
    seconds to fit the system; otherwise raises below MIN_SECONDS."""
    mode_key, mset = resolve_model_set(mode)
    thr_path = Path(model_folder) / MODEL_SUBDIR / mset["thresholds"]
    logger.info("Residual analysis | mode=%s | dataset=%s", mode_key, mset["dataset"])
    if not thr_path.is_file():
        raise FileNotFoundError(f"{mode_key}-mode thresholds not found: {thr_path}")
    with open(thr_path, "rb") as f:
        th = pickle.load(f)

    df = pp.prepare(test_df)
    graded = len(df) >= MIN_SECONDS
    if not graded and not allow_ungraded:
        raise ValueError(f"Need at least {MIN_SECONDS} seconds for residual analysis; got {len(df)}.")
    if graded:
        df.loc[df.index[:-1], "Score"] = _residual_scores(df)
    else:
        df["Score"] = np.nan

    return pp.build_test_result(df, th["thresholds"], graded, {
        "approach": ID, "approach_name": NAME,
        "mode": mode_key, "dataset": mset["dataset"], "thresholds_file": mset["thresholds"],
    })


def run_train_only(train_df, results_folder, model_folder):
    """Fit the benign baseline and save LOW/MED/HIGH thresholds (mean + k*std)."""
    df = pp.prepare(train_df)
    df = df[df[pp.LABEL_COL] == "BENIGN"]
    if len(df) < MIN_SECONDS:
        raise ValueError(f"Need at least {MIN_SECONDS} benign seconds to fit; got {len(df)}.")
    scores = _residual_scores(df)
    mu, std = float(scores.mean()), float(scores.std())
    thresholds = {"LOW": mu + std, "MED": mu + 2 * std, "HIGH": mu + 3 * std}
    out = Path(model_folder) / MODEL_SUBDIR
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "thresholds_VNRVJIET.pkl", "wb") as f:
        pickle.dump({"thresholds": thresholds, "LOW_THR": thresholds["LOW"],
                     "MED_THR": thresholds["MED"], "HIGH_THR": thresholds["HIGH"]}, f)
    return {"thresholds": thresholds,
            "residual_stats": {"mean": mu, "std": std, "max": float(scores.max())}}
