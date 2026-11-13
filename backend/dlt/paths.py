"""
Filesystem paths that work both in development and inside a PyInstaller-frozen
executable.

- Read-only bundled assets (pre-trained models, the built frontend) live next to
  the code in dev, and inside the PyInstaller bundle (sys._MEIPASS) when frozen.
- Writable state (SQLite DB, uploads, results) must NOT live inside the frozen
  bundle (it's a temp dir that's wiped on exit and may be read-only), so when
  frozen it goes in an `ews_data/` folder beside the .exe.
"""
import os
import sys
from pathlib import Path


def is_frozen():
    return bool(getattr(sys, "frozen", False))


def resource_dir():
    """Directory holding read-only bundled assets."""
    if is_frozen():
        # PyInstaller unpacks data files here; fall back to the exe dir.
        return Path(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)))
    return Path(__file__).resolve().parent.parent  # backend/


def _install_name():
    """Name of the folder the frozen app is installed in (e.g. 'Residual-based-ODE-EWS-IPS'
    or, for a side-by-side versioned install, 'Residual-based-ODE-EWS-IPS-1.1.0'). Used to keep
    each installed version's data separate. Falls back to a stable default."""
    if is_frozen():
        name = os.path.basename(os.path.dirname(os.path.abspath(sys.executable)))
        if name:
            return name
    return "Residual-based-ODE-EWS-IPS"


def data_dir():
    """Writable directory for DB / uploads / results.

    Resolution order:
      1. EWS_DATA_DIR env var, if set — an explicit, consistent path the client or
         admin chooses (e.g. point it at a shared folder). Always wins.
      2. Frozen (installed .exe): a per-user location under %LOCALAPPDATA% on Windows
         (else ~) named after the install folder, so side-by-side versions each keep
         their own data instead of sharing one alerts.db.
      3. Development: the backend/ folder, so results land in backend/dlt_results/.

    Whatever this resolves to, results are always under `<data_dir>/dlt_results/`
    (see RESULTS_DIR); the exact path is reported by GET /api/dlt/admin/storage."""
    override = os.environ.get("EWS_DATA_DIR")
    if override:
        d = Path(override).expanduser()
    elif is_frozen():
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        d = Path(base) / _install_name()
    else:
        d = Path(__file__).resolve().parent.parent  # backend/
    d.mkdir(parents=True, exist_ok=True)
    return d


# Read-only bundled assets.
MODELS_DIR = resource_dir() / "models"
FRONTEND_DIR = resource_dir() / "frontend_dist"

# Writable state.
RESULTS_DIR = data_dir() / "dlt_results"
UPLOAD_DIR = data_dir() / "dlt_uploads"
DB_PATH = RESULTS_DIR / "alerts.db"

for _d in (RESULTS_DIR, UPLOAD_DIR):
    _d.mkdir(parents=True, exist_ok=True)
