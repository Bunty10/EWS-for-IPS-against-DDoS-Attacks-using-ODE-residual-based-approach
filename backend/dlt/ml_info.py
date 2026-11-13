"""
Static description of the detection engine for the ML Information page.
Kept in sync with approach_residual.py / preprocessing.py.
"""
from dlt import pipeline


def ml_info():
    mod = pipeline.active()
    return {
        "name": mod.NAME,
        "approach_id": mod.ID,
        "summary": (
            "Benign traffic is modelled as the trajectory of a linear dynamical system "
            "fitted by least squares. PINN and Laplace residuals measure how far each "
            "second departs from that learned dynamic; their sum, graded against "
            "benign-baseline thresholds, becomes a LOW/MED/HIGH early warning."
        ),
        "approach": [
            "Aggregate raw flows into 1-second bins.",
            "Fit a linear system matrix Az to the benign feature dynamics.",
            "Compute the PINN residual (observed derivative vs Az·Z).",
            "Compute the Laplace residual (Z vs (S·I − Az)·Z).",
            "Score = per-second sum of the two residuals, graded against thresholds.",
        ],
        "framework": "NumPy system identification (no neural network)",
        "thresholds": {
            "LOW": "mean + 1·std of benign scores",
            "MED": "mean + 2·std",
            "HIGH": "mean + 3·std",
        },
        "features": pipeline.FEATURES,
        "feature_count": pipeline.NUM_FEATURES,
        "min_seconds": mod.MIN_SECONDS,
        "configuration": {
            "attack_ratio_threshold": 0.07,
            "live_reanalyze_interval_s": 1.0,
            "per_workflow_baselines": "LIVE → VNRVJIET · CSV → CICDDoS2019",
            "database": "dlt_results/alerts.db (SQLite)",
            "email": "SMTP via env vars (SMTP_HOST, ALERT_EMAIL_TO, ...) — HIGH alerts only",
        },
    }
