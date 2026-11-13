"""
Logging configuration for the EWS IPS engine.

Sends the "dlt.*" loggers (pipeline model selection, service workflow, etc.) to
the console AND to a rotating file next to the results, so clients and support can
see exactly which model/threshold set was loaded for each run — in dev and inside
the packaged .exe alike. The log path is reported by GET /api/dlt/admin/storage
(it lives in the same folder as the result CSVs).
"""
import logging
import sys
from logging.handlers import RotatingFileHandler

from dlt import paths

_configured = False
LOG_NAME = "ews_engine.log"


def log_path():
    return paths.RESULTS_DIR / LOG_NAME


def configure(level=logging.INFO):
    """Idempotent. Attach a stdout handler and a rotating file handler to the
    'dlt' logger tree. Safe to call from both dlt_app.py and launch.py."""
    global _configured
    if _configured:
        return
    _configured = True

    logger = logging.getLogger("dlt")
    logger.setLevel(level)
    logger.propagate = False
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    try:
        paths.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        fh = RotatingFileHandler(str(log_path()), maxBytes=1_000_000, backupCount=3, encoding="utf-8")
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    except Exception:  # noqa: BLE001 - never let logging setup break the app
        pass

    logger.info("Logging configured | file=%s", log_path())
