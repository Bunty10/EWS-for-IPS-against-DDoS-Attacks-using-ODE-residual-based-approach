"""
Orchestration layer for the EWS IPS engine.

Coordinates the two analysis workflows and the in-memory session state the frontend
polls (GET /api/dlt/status, /dashboard, /live/monitor, /topology). The scoring is
done by whichever detection approach the client selected (see pipeline.py); this
layer is approach-agnostic.

1. CSV upload (Dataset Analysis): the pipeline runs once over the whole file and the
   per-second series is revealed progressively so charts build up smoothly. Live
   capture is paused for the duration and resumes automatically when the upload ends.

2. Live capture (real-time IPS): a background thread re-runs the pipeline over a
   snapshot of the flows seen so far roughly once a second. Each capture second's
   early-warning level is decided ONCE — the first time that second can be scored —
   and then FROZEN in `_live_rows`; later ticks never change an already-graded
   timestamp. This is the IPS early-warning rule: the alert for "now" is what matters
   and past decisions are immutable. All live reads (Dashboard, Live Monitor,
   Topology) and the Alert History derive from this frozen store, and each second is
   persisted as at most one alert. Metrics are scoped to the current session and
   reset when live capture restarts or the approach is switched.
"""
import base64
import csv
import json
import logging
import math
import os
import re
import threading
import time
import traceback
from pathlib import Path

import pandas as pd

from dlt import pipeline
from dlt import live_capture
from dlt import db
from dlt import notifier
from dlt import recommendations
from dlt import paths

logger = logging.getLogger("dlt.service")

# Writable dirs (beside the .exe when frozen); models are read-only bundled.
UPLOAD_DIR = paths.UPLOAD_DIR
RESULTS_DIR = paths.RESULTS_DIR
MODEL_DIR = paths.MODELS_DIR
for _d in (UPLOAD_DIR, RESULTS_DIR):
    _d.mkdir(parents=True, exist_ok=True)


def _materialize_pretrained_model():
    """Pre-trained artifacts ship under backend/models/<approach>/. As a convenience,
    any *.pkl.b64 (base64 text) sidecar found there is decoded into its .pkl on
    startup, so models can be committed as text when that is easier."""
    if not MODEL_DIR.is_dir():
        return
    for b64_path in MODEL_DIR.rglob("*.pkl.b64"):
        pkl_path = b64_path.with_suffix("")  # drop the trailing .b64
        if not pkl_path.is_file():
            pkl_path.write_bytes(base64.b64decode(b64_path.read_text()))


_materialize_pretrained_model()

# Reveal cadence for progressive CSV-upload playback (see module docstring, point 1).
REVEAL_BATCH_SECONDS = 3
REVEAL_DELAY = 0.15

# How often the live-capture background thread re-analyzes the in-progress capture.
# Kept short so freshly captured traffic shows in the Live Monitor / Dashboard within
# about a second, rather than only after enough data exists to grade it.
LIVE_REANALYZE_INTERVAL = 1.0

# After a manual CSV upload finishes, wait this long before resuming live capture
# so the Dataset Analysis page can settle on the final result first.
RESUME_AFTER_UPLOAD_DELAY = 3.0

# Once live capture has run once (e.g. auto-started at launch), the engine is in
# "live mode" and will resume live capture automatically after a CSV upload ends.
_auto_live_enabled = False

# Early-warning policy: the "Current Threat Level" reflects the most recent
# analyzed second. If no MED/HIGH second has been frozen within this many wall-clock
# seconds, the level decays back to NORMAL (so a brief spike doesn't stay latched).
THREAT_HOLD_SECONDS = 5.0

_lock = threading.RLock()
_generation = 0  # bumped whenever a new job starts, so stale background threads bail out

# Identifies the current analysis run in the DB. A fresh id is minted whenever a
# new upload/capture starts, so metrics, "active alerts", and the topology view are
# scoped to the current session and reset when live capture restarts.
_current_session_id = None

# Records which model/threshold set the most recent analysis actually loaded, so
# the ML Info page and logs can show it. Set from each pipeline result's model_info.
_last_model_info = None


def _note_model(test_result, mode):
    """Capture the model set a pipeline run reported (for /ml-info, /model-info)."""
    global _last_model_info
    mi = (test_result or {}).get("model_info")
    if mi:
        _last_model_info = {**mi, "at": time.strftime("%Y-%m-%d %H:%M:%S")}
    return test_result


def model_status():
    """Threshold/model selection summary for the ML Info page and logs: the active
    approach, each workflow's mode→dataset mapping, which set was used last, and
    which files are present on disk for the active approach."""
    mod = pipeline.active()
    subdir = MODEL_DIR / mod.MODEL_SUBDIR
    files = set()
    for mset in mod.MODEL_SETS.values():
        files.update(v for k, v in mset.items() if k in ("model", "thresholds"))
    return {
        "approach": {"id": mod.ID, "name": mod.NAME},
        "modes": {
            "LIVE": {"workflow": "Live Traffic Capture & Analysis", **mod.MODEL_SETS["LIVE"]},
            "CSV": {"workflow": "Upload CSV Analysis", **mod.MODEL_SETS["CSV"]},
        },
        "last_used": _last_model_info,
        "available": {name: (subdir / name).is_file() for name in sorted(files)},
    }

# Seconds already written to the DB for the current run (dedup key is the second
# alone, so a timestamp's alert is declared once and never overwritten later).
_persisted_keys = set()
ALERT_LEVELS = ("LOW", "MED", "HIGH")

# ── Frozen live per-second store (IPS early-warning behavior) ────────────────
# Each capture second's alert is decided ONCE — when that second first appears —
# and then frozen. Later ticks (which re-normalize over more data) never change an
# already-frozen second. All live reads (dashboard feed, Live Monitor, topology)
# come from this store, guaranteeing stable timestamps and one alert per second.
_live_rows = []            # ordered list of frozen per-second row dicts
_live_last_second = 0      # highest second already frozen this session
_live_graded_seconds = set()  # seconds whose residual grade has been applied (frozen once)
_live_last_row_wall = 0.0  # time.time() of the most recent frozen second (any level)
_live_last_alert_wall = 0.0  # time.time() of the last MED/HIGH second frozen
_live_packets_total = 0    # total packets observed this session (capture counter)


def _reset_live_store():
    global _live_rows, _live_last_second, _live_last_row_wall
    global _live_last_alert_wall, _live_packets_total, _live_graded_seconds
    _live_rows = []
    _live_last_second = 0
    _live_graded_seconds = set()
    _live_last_row_wall = 0.0
    _live_last_alert_wall = 0.0
    _live_packets_total = 0


def _new_session():
    global _current_session_id
    _current_session_id = time.strftime("%Y%m%d-%H%M%S")
    _persisted_keys.clear()
    _reset_live_store()
    return _current_session_id


def get_current_session_id():
    return _current_session_id


def _confidence_from_score(score, thresholds):
    """Map a residual score onto a 0..1 confidence using the HIGH threshold as the
    reference point (a score at/above HIGH is full confidence)."""
    try:
        high = float((thresholds or {}).get("HIGH") or 0)
        if high <= 0:
            return None
        return max(0.0, min(1.0, float(score) / high))
    except (TypeError, ValueError):
        return None


def _alert_from_row(row, thresholds, source):
    """Build an alert dict from a per-second pipeline row."""
    label = row.get("Label")
    attack_type = "DDoS" if label and label != "BENIGN" else "Anomaly (traffic deviation)"
    return {
        "session_id": _current_session_id,
        "second": row.get("second"),
        "timestamp": row.get("Timestamp"),
        "source_ip": row.get("SourceIP") or None,
        "destination_ip": row.get("DestinationIP") or None,
        "source_port": str(row.get("SourcePort")) if row.get("SourcePort") not in (None, "") else None,
        "destination_port": str(row.get("DestinationPort")) if row.get("DestinationPort") not in (None, "") else None,
        "protocol": str(row.get("Protocol")) if row.get("Protocol") not in (None, "") else None,
        "attack_type": attack_type,
        "confidence": _confidence_from_score(row.get("score"), thresholds),
        "level": row.get("Warning"),
        "score": row.get("score"),
        "source": source,
    }


def _persist_alert_once(row, thresholds, source):
    """Persist one LOW/MED/HIGH second to the DB — exactly once per (session, second)
    so a timestamp's alert is declared once and never overwritten. Emails new HIGH
    alerts. Returns the alert dict if it was newly written, else None."""
    level = row.get("Warning")
    if level not in ALERT_LEVELS:
        return None
    second = row.get("second")
    with _lock:
        if second in _persisted_keys:
            return None
        _persisted_keys.add(second)
    alert = _alert_from_row(row, thresholds, source)
    row_id = db.insert_alert(alert)  # UNIQUE(session_id, second) also guards duplicates
    if row_id and level == "HIGH":
        try:
            notifier.send_high_alert(alert)
        except Exception:  # noqa: BLE001 - never let notification break analysis
            traceback.print_exc()
    return alert if row_id else None


def _persist_alerts_from_result(full_result, source):
    """Persist every alerting second in a completed result (CSV uploads / final live
    pass). Each second is written at most once."""
    test1 = (full_result or {}).get("test1") or {}
    thresholds = test1.get("thresholds")
    for row in (test1.get("traffic_data") or []):
        _persist_alert_once(row, thresholds, source)

_state = {
    "job_type": None,       # "upload" | "live" | None
    "status": "idle",       # idle | processing | capturing | analyzing | done | error
    "message": "",
    "progress": {
        "seconds_revealed": 0,
        "max_seconds": 0,
        "pct": 0,
    },
    "capture": {
        "capturing": False,
        "seconds": 0,
        "last_error": None,
    },
    "result": None,         # {"train": None, "test1": {...}, "test2": None} (v1 shape)
    "error": None,
    "updated_at": None,
}


def _nan_to_none(obj):
    """Recursively replace float('nan')/inf with None so json.dumps/jsonify never chokes."""
    if isinstance(obj, dict):
        return {k: _nan_to_none(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_nan_to_none(v) for v in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


def _update(**kwargs):
    with _lock:
        _state.update(kwargs)
        _state["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")


def _update_progress(**kwargs):
    with _lock:
        _state["progress"].update(kwargs)


def _update_capture(**kwargs):
    with _lock:
        _state["capture"].update(kwargs)


def get_status():
    with _lock:
        return _nan_to_none(json.loads(json.dumps(_state, default=str)))


def get_results():
    with _lock:
        return _nan_to_none(_state["result"])


def _save_results_file(results):
    path = RESULTS_DIR / "results.json"
    with open(path, "w") as f:
        json.dump(_nan_to_none(results), f, indent=2)


def _safe_csv_name(filename):
    """Sanitize a client-supplied filename to a bare .csv basename (no path
    traversal), so exports can only ever land inside RESULTS_DIR."""
    base = os.path.basename(str(filename or "")).strip() or "export.csv"
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    if not base.lower().endswith(".csv"):
        base += ".csv"
    return base


def save_export_csv(filename, columns, rows):
    """Write the per-second table to backend/dlt_results/<filename>.csv.

    `columns` is an optional [{field, headerName}] list (from the frontend grid)
    that fixes the column order and header labels; when omitted, the union of row
    keys is used. `rows` are the traffic_data dicts. Falls back to the current
    in-memory results when `rows` is empty so the button works even if the client
    sends no payload."""
    if not rows:
        results = get_results()
        rows = (results or {}).get("test1", {}).get("traffic_data") or []
    if not rows:
        return {"error": "No data to export."}

    if columns:
        fields = [c.get("field") for c in columns if c.get("field")]
        headers = [c.get("headerName") or c.get("field") for c in columns if c.get("field")]
    else:
        fields = list(rows[0].keys())
        headers = fields

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    safe = _safe_csv_name(filename)
    path = RESULTS_DIR / safe
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for r in rows:
            writer.writerow(["" if r.get(fld) is None else r.get(fld) for fld in fields])

    return {"status": "saved", "filename": safe, "path": str(path), "rows": len(rows)}


def _wrap_test_result(test_result):
    return {"train": None, "test1": test_result, "test2": None}


def _reveal_progressively(token, full_result):
    """Slice full_result['test1']['traffic_data'] into growing prefixes and publish
    them at a steady cadence, so the frontend chart builds up second by second."""
    test1 = full_result["test1"]
    traffic = test1.get("traffic_data") or []
    max_seconds = test1.get("max_seconds") or (traffic[-1]["second"] if traffic else 0)

    if not traffic:
        with _lock:
            if _generation != token:
                return
        _update(result=full_result, status="done", message="Analysis complete.")
        _update_progress(seconds_revealed=max_seconds, max_seconds=max_seconds, pct=100)
        return

    revealed_second = 0
    while revealed_second < max_seconds:
        with _lock:
            if _generation != token:
                return  # a newer job superseded this one; stop revealing
        revealed_second = min(revealed_second + REVEAL_BATCH_SECONDS, max_seconds)
        partial_traffic = [d for d in traffic if d["second"] <= revealed_second]
        partial_test1 = dict(test1)
        partial_test1["traffic_data"] = partial_traffic
        pct = int(round(100 * revealed_second / max_seconds)) if max_seconds else 100
        _update(result=_wrap_test_result(partial_test1), status="processing",
                message=f"Analyzing... {revealed_second}/{max_seconds}s")
        _update_progress(seconds_revealed=revealed_second, max_seconds=max_seconds, pct=pct)
        time.sleep(REVEAL_DELAY)

    with _lock:
        if _generation != token:
            return
    _update(result=full_result, status="done", message="Analysis complete.")
    _update_progress(seconds_revealed=max_seconds, max_seconds=max_seconds, pct=100)
    _save_results_file(full_result)
    _persist_alerts_from_result(full_result, source="upload")


def _run_upload_job(token, csv_path):
    try:
        _update(status="processing", message="Reading CSV and running analysis...",
                error=None)
        _update_progress(seconds_revealed=0, max_seconds=0, pct=0)

        test_result = _note_model(
            pipeline.run_test_only(csv_path, str(RESULTS_DIR), str(MODEL_DIR), mode="CSV"),
            "CSV",
        )
        full_result = _wrap_test_result(test_result)

        with _lock:
            if _generation != token:
                return

        _reveal_progressively(token, full_result)
    except Exception as e:
        traceback.print_exc()
        with _lock:
            if _generation != token:
                return
        _update(status="error", error=str(e), message=f"Analysis failed: {e}")
    finally:
        # Whether the upload succeeded or failed, resume live monitoring.
        _maybe_resume_live(token)


def start_upload_analysis(csv_path):
    """The CSV has already been saved to disk by the route handler
    before this is called -- this kicks off analysis on the complete file."""
    global _generation
    with _lock:
        _generation += 1
        token = _generation
        _new_session()
    # Pause live capture (if running) while the CSV is analyzed; it resumes
    # automatically once the upload finishes (see _maybe_resume_live).
    live_capture.stop_capture_thread()
    _update_capture(capturing=False)
    logger.info("Upload analysis started | mode=CSV -> CICDDoS2019 model | file=%s", csv_path)
    _update(job_type="upload", status="processing", message="Starting analysis...",
            result=None, error=None)
    _update_progress(seconds_revealed=0, max_seconds=0, pct=0)
    t = threading.Thread(target=_run_upload_job, args=(token, csv_path), daemon=True)
    t.start()
    return token


def _maybe_resume_live(token):
    """After a CSV upload ends, resume continuous live capture — but only if the
    engine was already in live mode, no newer job has started, and capture isn't
    already running. Runs after a short delay so the results page can settle."""
    if not _auto_live_enabled:
        return
    time.sleep(RESUME_AFTER_UPLOAD_DELAY)
    with _lock:
        if _generation != token:
            return  # a newer upload/capture superseded this one
        if _state.get("capture", {}).get("capturing"):
            return
    start_live_capture()


def _freeze_new_seconds(test_result, source="live"):
    """Freeze per-second rows for the live store, in two stages:

    1. A second is DISPLAYED the moment it first appears — appended to the frozen
       store even before there is enough data to grade it — so the Live Monitor and
       Dashboard show captured traffic immediately. A not-yet-gradeable second is
       shown as BENIGN with no score.
    2. A second is GRADED exactly once: the first time an analysis run can score it
       (``test_result['graded']`` is True), its Warning/score are written in and the
       alert persisted. After that the second is immutable — later re-analysis over
       more data never re-grades a passed timestamp (the IPS early-warning rule).

    Returns the number of seconds newly displayed this call."""
    global _live_last_second, _live_last_row_wall, _live_last_alert_wall
    thresholds = test_result.get("thresholds")
    graded = bool(test_result.get("graded"))
    traffic = test_result.get("traffic_data") or []
    frozen = 0
    now = time.time()
    for row in traffic:
        second = row.get("second")
        if not isinstance(second, int):
            continue

        if second > _live_last_second:
            # First time we see this second → display it right away.
            _live_rows.append(dict(row))
            _live_last_second = second
            _live_last_row_wall = now
            frozen += 1
            if graded:
                _live_graded_seconds.add(second)
                if row.get("Warning") in ("MED", "HIGH"):
                    _live_last_alert_wall = now
                _persist_alert_once(row, thresholds, source)
        elif graded and second not in _live_graded_seconds:
            # Second already on screen but not yet graded → apply its grade once.
            idx = second - 1  # aggregate numbers seconds 1..N contiguously
            if 0 <= idx < len(_live_rows) and _live_rows[idx].get("second") == second:
                stored = _live_rows[idx]
                stored["Warning"] = row.get("Warning")
                stored["score"] = row.get("score")
                _live_graded_seconds.add(second)
                if row.get("Warning") in ("MED", "HIGH"):
                    _live_last_alert_wall = now
                _persist_alert_once(row, thresholds, source)
    return frozen


def _publish_live_result():
    """Rebuild the in-memory result from the frozen rows so /status stays consistent."""
    with _lock:
        rows = list(_live_rows)
    test1 = {
        "traffic_data": rows,
        "max_seconds": rows[-1]["second"] if rows else 0,
        "thresholds": None,
    }
    _update(result=_wrap_test_result(test1))


def _continuous_live_analysis(token):
    """Background loop for live capture. Each tick re-runs the pipeline over a
    snapshot of the flows seen so far, then FREEZES only the seconds that are new
    since the last tick (see _freeze_new_seconds). Frozen seconds are never
    recomputed, so the early-warning level for each timestamp is decided once."""
    global _live_packets_total
    while True:
        with _lock:
            if _generation != token:
                return
        status = live_capture.get_capture_status()
        preview = status.get("preview") or {}
        with _lock:
            _live_packets_total = int(preview.get("total_packets") or _live_packets_total)
        _update_capture(capturing=status.get("capturing", False),
                        seconds=status.get("seconds", 0),
                        last_error=status.get("last_error"))
        if not status.get("capturing", False):
            return

        try:
            snapshot_df = live_capture.snapshot_flows_df(str(RESULTS_DIR))
            if len(snapshot_df) >= 1:
                test_result = _note_model(
                    pipeline.run_test_only(snapshot_df, str(RESULTS_DIR), str(MODEL_DIR),
                                           mode="LIVE", allow_ungraded=True),
                    "LIVE",
                )
                with _lock:
                    if _generation != token:
                        return
                    _freeze_new_seconds(test_result, source="live")
                _publish_live_result()
                graded = bool(test_result.get("graded"))
                note = "analyzed" if graded else "captured (scoring at %ds)" % pipeline.MIN_SECONDS
                _update(status="capturing",
                        message=f"Capturing... {len(_live_rows)}s {note}")
                _update_progress(seconds_revealed=_live_last_second,
                                 max_seconds=_live_last_second, pct=None)
        except Exception as e:
            # Too little data yet, or a transient aggregation issue -- not fatal, just
            # skip this tick and try again on the next one.
            _update(message=f"Capturing... (waiting for enough flow data: {e})")

        time.sleep(LIVE_REANALYZE_INTERVAL)


def start_live_capture():
    global _generation, _auto_live_enabled
    with _lock:
        _generation += 1
        token = _generation
        _new_session()
        _auto_live_enabled = True  # engine is now in live mode → resume after uploads
    logger.info("Live capture started | mode=LIVE -> VNRVJIET model")
    _update(job_type="live", status="capturing", message="Live capture started.",
            result=None, error=None)
    _update_progress(seconds_revealed=0, max_seconds=0, pct=None)
    _update_capture(capturing=True, seconds=0, last_error=None)

    out = live_capture.start_capture(results_folder=str(RESULTS_DIR))
    if "error" in out:
        _update(status="error", error=out["error"], message=out["error"])
        _update_capture(capturing=False)
        return out

    t = threading.Thread(target=_continuous_live_analysis, args=(token,), daemon=True)
    t.start()
    return out


def stop_live_capture():
    """Stop capture, save the flows, run one final authoritative analysis, publish results."""
    global _generation
    with _lock:
        _generation += 1
        token = _generation  # invalidate the continuous-analysis loop from this point on

    _update(status="analyzing", message="Stopping capture and saving...")
    _update_capture(capturing=False)

    save_out = live_capture.stop_capture_and_save(results_folder=str(RESULTS_DIR))
    if save_out.get("rows", 0) == 0:
        _update(status="error", error="No flow data captured.",
                message="No flow data was captured (0 usable flows).")
        return {"error": "No flow data captured.", **save_out}

    try:
        live_path = os.path.join(str(RESULTS_DIR), "live_capture.csv")
        _update(status="analyzing", message="Running final analysis on captured traffic...")
        test_result = _note_model(
            pipeline.run_test_only(live_path, str(RESULTS_DIR), str(MODEL_DIR),
                                   mode="LIVE", allow_ungraded=True),
            "LIVE",
        )
        # Freeze any seconds not yet frozen during capture (never re-grade old ones),
        # then publish the authoritative live result from the frozen store.
        with _lock:
            _freeze_new_seconds(test_result, source="live")
        _publish_live_result()
        with _lock:
            full_result = _state.get("result")
            max_seconds = _live_last_second
        _update(status="done", message="Live capture analysis complete.")
        _update_progress(seconds_revealed=max_seconds, max_seconds=max_seconds, pct=100)
        _save_results_file(full_result)
        return {"message": "Live capture analysis complete", "results": full_result, **save_out}
    except Exception as e:
        traceback.print_exc()
        _update(status="error", error=str(e), message=f"Final analysis failed: {e}")
        return {"error": str(e), **save_out}


_LEVEL_ORDER = {"BENIGN": 0, "LOW": 1, "MED": 2, "HIGH": 3}


def _live_threat_level():
    """Current threat level for the Dashboard, based on the frozen live store:
      - the level of the most-recently-frozen second (LOW/MED/HIGH shown as-is), so
        HIGH@4s → HIGH, then LOW@5s → LOW;
      - NORMAL when that second is benign, or when no new second has been frozen for
        more than THREAT_HOLD_SECONDS (traffic went quiet)."""
    with _lock:
        if not _live_rows:
            return "BENIGN"
        latest = _live_rows[-1].get("Warning") or "BENIGN"
        last_wall = _live_last_row_wall
    if latest not in ALERT_LEVELS:
        return "BENIGN"
    if time.time() - last_wall > THREAT_HOLD_SECONDS:
        return "BENIGN"  # traffic went quiet — decay to NORMAL
    return latest


def _live_benign_count():
    with _lock:
        return sum(1 for r in _live_rows if (r.get("Warning") or "BENIGN") == "BENIGN")


def dashboard_metrics():
    """Key metrics for the Dashboard. All alert counts come from the DB session
    breakdown so they are internally consistent:
        Suspicious (LOW+MED) + High Risk (HIGH) == Active Alerts.
    Metrics reflect the CURRENT live session only and reset when live capture
    restarts (a new session id). CSV uploads are shown on the Dataset Analysis
    page, so they never leak into the dashboard."""
    with _lock:
        status = _state.get("status", "idle")
        capturing = _state.get("capture", {}).get("capturing", False)
        job_type = _state.get("job_type")
        session_id = _current_session_id
        packets_total = _live_packets_total

    is_live = job_type == "live"
    if is_live and session_id:
        breakdown = db.level_breakdown(session_id=session_id)
        high_risk = breakdown.get("HIGH", 0)
        suspicious = breakdown.get("LOW", 0) + breakdown.get("MED", 0)
        active_alerts = suspicious + high_risk          # == LOW+MED+HIGH by construction
        normal_traffic = _live_benign_count()
        packet_capture = packets_total
        threat_level = _live_threat_level()
    else:
        high_risk = suspicious = active_alerts = normal_traffic = packet_capture = 0
        threat_level = "BENIGN"

    total_breakdown = db.level_breakdown()
    attacks_detected = sum(total_breakdown.get(k, 0) for k in ALERT_LEVELS)

    system_status = {
        "idle": "Idle", "processing": "Analyzing", "capturing": "Capturing",
        "analyzing": "Analyzing", "done": "Ready", "error": "Error",
    }.get(status, status)

    return {
        # Spec-named metric values:
        "packet_capture": packet_capture,
        "normal_traffic": normal_traffic,
        "suspicious_traffic": suspicious,
        "high_risk": high_risk,
        "current_status": system_status,
        # Key metrics:
        "total_packets": packet_capture,
        "attacks_detected": attacks_detected,
        "current_threat_level": threat_level,
        "active_alerts": active_alerts,
        "system_status": system_status,
        "capturing": capturing,
        "session_id": session_id,
        "raw_status": status,
        "updated_at": _state.get("updated_at"),
    }


def recent_live_rows(limit=50):
    """Newest-first frozen per-second rows (timestamp/src/dst/protocol/level) for the
    Dashboard feed and Live Traffic Monitoring. Live capture only — CSV-upload
    results belong to the Dataset Analysis page."""
    with _lock:
        capturing = _state.get("capture", {}).get("capturing", False)
        status = _state.get("status", "idle")
        job_type = _state.get("job_type")
        recent = list(_live_rows[-limit:]) if job_type == "live" else []
    rows = [{
        "second": row.get("second"),
        "timestamp": row.get("Timestamp"),
        "source_ip": row.get("SourceIP") or "-",
        "destination_ip": row.get("DestinationIP") or "-",
        "protocol": row.get("Protocol") or "-",
        "level": row.get("Warning") or "BENIGN",
        "packets_s": row.get("FlowPackets_s"),
    } for row in recent]
    rows.reverse()  # newest first
    return {"rows": rows, "capturing": capturing, "status": status}


def statistics(session_id=None):
    """Chart data for the Attack/Alert Statistics page (pie/line/bar)."""
    scope = session_id if session_id else None
    breakdown = db.level_breakdown(session_id=scope)
    return {
        "level_breakdown": breakdown,
        "attack_types": db.attack_type_breakdown(session_id=scope),
        "over_time": db.alerts_over_time(limit=100, session_id=scope),
        "top_source_ips": db.top_source_ips(limit=10, session_id=scope),
        "totals": {
            "alerts": sum(breakdown.get(k, 0) for k in ALERT_LEVELS),
            **{k: breakdown.get(k, 0) for k in ALERT_LEVELS},
        },
    }


TOPOLOGY_WINDOW = 60  # seconds of recent frozen traffic used to draw the topology


def topology(session_id=None):
    """Live defence-in-depth network topology.

    Returns the distinct SOURCE IPs seen in the recent live traffic, each with its
    worst early-warning level in that window, plus the fixed defence-in-depth chain
    the frontend draws:

        Network / Internet (External) → Firewall (Perimeter) → IPS / EWS (Prevention) → Source IPs

    Each source path is GREEN when the source has no alerts and RED when it has
    MED/HIGH; the trunk (Internet→Firewall→IPS) turns red when any source in the
    window is suspicious. When live capture isn't running (or there is no recent
    communication) the view is 'idle' (nothing highlighted)."""
    with _lock:
        capturing = _state.get("capture", {}).get("capturing", False)
        job_type = _state.get("job_type")
        rows = list(_live_rows) if job_type == "live" else []
        last_second = _live_last_second

    live = bool(capturing and job_type == "live")
    sources = {}
    if live and rows:
        cutoff = last_second - TOPOLOGY_WINDOW
        for row in rows:
            if row.get("second", 0) < cutoff:
                continue
            ip = row.get("SourceIP")
            if not ip:
                continue
            lvl = row.get("Warning") or "BENIGN"
            prev = sources.get(ip, "BENIGN")
            if _LEVEL_ORDER.get(lvl, 0) > _LEVEL_ORDER.get(prev, 0):
                sources[ip] = lvl

    source_list = sorted(
        ({"ip": ip, "level": lvl, "suspicious": lvl in ("MED", "HIGH")}
         for ip, lvl in sources.items()),
        key=lambda s: (-_LEVEL_ORDER.get(s["level"], 0), s["ip"]),
    )
    highest = "BENIGN"
    for s in source_list:
        if _LEVEL_ORDER.get(s["level"], 0) > _LEVEL_ORDER.get(highest, 0):
            highest = s["level"]

    has_suspicious = any(s["suspicious"] for s in source_list)

    # Fixed defence-in-depth chain the frontend draws left→right before fanning
    # out to the live source IPs. Returned as data so the layout stays in sync.
    layers = [
        {"id": "internet", "label": "Network / Internet", "sublabel": "External"},
        {"id": "firewall", "label": "Firewall", "sublabel": "Perimeter"},
        {"id": "ips", "label": "IPS / EWS", "sublabel": "Prevention"},
    ]

    return {
        "capturing": live,
        "idle": (not live) or (len(source_list) == 0),
        "threat_level": highest,
        "has_suspicious": has_suspicious,
        "central": "IPS / EWS",
        "layers": layers,
        "sources": source_list,
        "suspicious_source_ips": [
            {"source_ip": s["ip"]} for s in source_list if s["suspicious"]
        ],
    }


def storage_info():
    """Where result/CSV files live on this machine, plus the CSVs currently present.

    Lets the Admin panel show clients the exact folder their Live Traffic and
    Uploaded-CSV results are written to — important for the packaged .exe, where
    data lives under %LOCALAPPDATA% (or EWS_DATA_DIR), not next to the program."""
    files = []
    try:
        for p in sorted(RESULTS_DIR.glob("*.csv")):
            st = p.stat()
            files.append({
                "name": p.name,
                "size": st.st_size,
                "modified": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime)),
            })
    except Exception:  # noqa: BLE001
        pass
    return {
        "results_dir": str(RESULTS_DIR),
        "uploads_dir": str(UPLOAD_DIR),
        "db_path": str(paths.DB_PATH),
        "frozen": paths.is_frozen(),
        "data_dir_override": os.environ.get("EWS_DATA_DIR") or None,
        "csv_files": files,
    }


def reset():
    """Used at import time / between unrelated jobs to return to a clean idle state."""
    global _generation
    with _lock:
        _generation += 1
    _update(job_type=None, status="idle", message="", result=None, error=None)
    _update_progress(seconds_revealed=0, max_seconds=0, pct=0)
    _update_capture(capturing=False, seconds=0, last_error=None)
