"""
Pipeline facade for the Residual-based ODE detection engine.

Every part of the application scores traffic through this module instead of
importing the engine directly, so the scoring approach stays in one place. All
data pre-processing and output formatting is shared (see preprocessing.py); only
the per-second scoring lives in approach_residual.py.
"""
from dlt import preprocessing as pp
from dlt import approach_residual as engine

# Re-export the shared constants so callers can keep importing them from `pipeline`.
FEATURES = pp.FEATURES
NUM_FEATURES = pp.NUM_FEATURES
LABEL_COL = pp.LABEL_COL

# Engine settings surfaced to the rest of the app.
MODEL_SETS = engine.MODEL_SETS
MIN_SECONDS = engine.MIN_SECONDS


def active():
    """The detection engine module."""
    return engine


def active_id():
    return engine.ID


def resolve_model_set(mode):
    return engine.resolve_model_set(mode)


def run_test_only(test_df, results_folder, model_folder, mode="LIVE", allow_ungraded=False):
    return engine.run_test_only(test_df, results_folder, model_folder, mode, allow_ungraded)


def run_train_only(train_df, results_folder, model_folder):
    return engine.run_train_only(train_df, results_folder, model_folder)
