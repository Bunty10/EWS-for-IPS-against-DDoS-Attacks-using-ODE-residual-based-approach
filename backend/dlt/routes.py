"""
HTTP API for the EWS IPS engine.

All endpoints are mounted under /api/dlt/* by backend/dlt_app.py. Handlers are thin:
they validate input and delegate to the service layer, the database, and the active
detection approach (see dlt/pipeline.py).
"""
import os
import time

from flask import Blueprint, jsonify, request, Response

from dlt import service
from dlt import db
from dlt import recommendations
from dlt import reports
from dlt import ml_info
from dlt import notifier
from dlt import pipeline

dlt_bp = Blueprint("dlt", __name__, url_prefix="/api/dlt")


@dlt_bp.route("/upload", methods=["POST"])
def dlt_upload():
    """Save the uploaded CSV to disk, then
    kick off analysis on a background thread."""
    try:
        file = request.files.get("file") or request.files.get("test")
        if not file:
            return jsonify({"error": "Please upload a CSV file (field name 'file')"}), 400
        if not file.filename.lower().endswith(".csv"):
            return jsonify({"error": "Please upload a .csv file"}), 400

        service.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        dest = service.UPLOAD_DIR / "test.csv"
        file.save(str(dest))

        # CSV Upload Analysis uses the active approach's CSV baseline (CICDDoS2019).
        mod = pipeline.active()
        _, mset = mod.resolve_model_set("CSV")
        thresholds_path = service.MODEL_DIR / mod.MODEL_SUBDIR / mset["thresholds"]
        if not thresholds_path.is_file():
            return jsonify({
                "error": f"CSV-analysis baseline not found for the {mod.NAME} approach. "
                         f"Expected models/{mod.MODEL_SUBDIR}/{mset['thresholds']}."
            }), 400

        service.start_upload_analysis(str(dest))
        return jsonify({"message": "Upload received. Analysis started.", "status": "started"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@dlt_bp.route("/status", methods=["GET"])
def dlt_status():
    """Polled about once a second by the frontend (the same cadence as
    /api/continuous-capture/status) to drive the continuously-updating charts."""
    return jsonify(service.get_status())


@dlt_bp.route("/results", methods=["GET"])
def dlt_results():
    """Final results only, normalized like v1's GET /results."""
    results = service.get_results()
    if not results:
        return jsonify({"error": "No results found"}), 404
    return jsonify(results)


@dlt_bp.route("/capture/start", methods=["POST"])
def dlt_capture_start():
    try:
        out = service.start_live_capture()
        if isinstance(out, dict) and out.get("error"):
            return jsonify(out), 400
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@dlt_bp.route("/capture/stop", methods=["POST"])
def dlt_capture_stop():
    """Stop capture, then save, analyze and return results — all performed
    synchronously here (mirrors v1's POST /live/stop + POST /live/process)."""
    try:
        out = service.stop_live_capture()
        if isinstance(out, dict) and out.get("error") and not out.get("results"):
            return jsonify(out), 400
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@dlt_bp.route("/capture/preview", methods=["GET"])
def dlt_capture_preview():
    """Lightweight packet/byte counters while capturing (v1's GET /live/preview)."""
    try:
        from dlt import live_capture
        return jsonify(live_capture.get_capture_preview())
    except Exception:
        return jsonify({"total_packets": 0, "total_bytes": 0, "seconds_with_data": 0, "sample_rows": []})


@dlt_bp.route("/export", methods=["POST"])
def dlt_export():
    """Write the per-second table to backend/dlt_results/<filename>.csv on the
    server. Body: { filename, columns:[{field,headerName}], rows:[...] }. When rows
    are omitted the current in-memory results are exported instead."""
    try:
        data = request.get_json(silent=True) or {}
        out = service.save_export_csv(
            data.get("filename"), data.get("columns"), data.get("rows"),
        )
        if out.get("error"):
            return jsonify(out), 400
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@dlt_bp.route("/reset", methods=["POST"])
def dlt_reset():
    service.reset()
    return jsonify({"status": "idle"})


@dlt_bp.route("/storage", methods=["GET"])
def dlt_storage():
    """Where result CSVs are stored on this machine + the files currently present.
    Also mounted under /admin/storage for the Admin panel."""
    return jsonify(service.storage_info())


@dlt_bp.route("/admin/storage", methods=["GET"])
def dlt_admin_storage():
    return jsonify(service.storage_info())


# ── Dashboard / live monitoring ─────────────────────────────────────────────

@dlt_bp.route("/dashboard", methods=["GET"])
def dlt_dashboard():
    """Key metrics for the homepage; polled live during capture."""
    return jsonify(service.dashboard_metrics())


@dlt_bp.route("/live/monitor", methods=["GET"])
def dlt_live_monitor():
    """Newest-first Timestamp/Source/Destination/Protocol rows for the
    auto-refreshing Live Traffic Monitoring table."""
    limit = request.args.get("limit", default=50, type=int)
    return jsonify(service.recent_live_rows(limit=limit))


# ── Alert history & details ─────────────────────────────────────────────────

@dlt_bp.route("/alerts", methods=["GET"])
def dlt_alerts():
    limit = request.args.get("limit", default=200, type=int)
    offset = request.args.get("offset", default=0, type=int)
    level = request.args.get("level")
    session_id = request.args.get("session_id")
    items = db.list_alerts(limit=limit, offset=offset, level=level, session_id=session_id)
    return jsonify({"alerts": items, "total": db.count_alerts(level=level, session_id=session_id)})


@dlt_bp.route("/alerts/<int:alert_id>", methods=["GET"])
def dlt_alert_detail(alert_id):
    """Attack details for one alert + the recommendation for its severity."""
    alert = db.get_alert(alert_id)
    if not alert:
        return jsonify({"error": "Alert not found"}), 404
    alert["recommendation"] = recommendations.for_level(alert.get("level"))
    return jsonify(alert)


# ── Statistics / recommendations / ML info / topology ───────────────────────

@dlt_bp.route("/statistics", methods=["GET"])
def dlt_statistics():
    session_id = request.args.get("session_id")
    return jsonify(service.statistics(session_id=session_id))


@dlt_bp.route("/recommendations", methods=["GET"])
def dlt_recommendations():
    return jsonify(recommendations.all_recommendations())


@dlt_bp.route("/ml-info", methods=["GET"])
def dlt_ml_info():
    info = ml_info.ml_info()
    info["model_selection"] = service.model_status()
    return jsonify(info)


@dlt_bp.route("/model-info", methods=["GET"])
def dlt_model_info():
    """Which model/thresholds each mode uses, what was loaded last, availability."""
    return jsonify(service.model_status())


@dlt_bp.route("/topology", methods=["GET"])
def dlt_topology():
    session_id = request.args.get("session_id")
    return jsonify(service.topology(session_id=session_id))


# ── Admin panel ─────────────────────────────────────────────────────────────

@dlt_bp.route("/admin/blocked-ips", methods=["GET"])
def dlt_blocked_ips():
    return jsonify({"blocked": db.list_blocked_ips(), "email_configured": notifier.is_configured()})


@dlt_bp.route("/admin/blocked-ips", methods=["POST"])
def dlt_block_ip():
    data = request.get_json(silent=True) or {}
    ip = (data.get("ip") or "").strip()
    if not ip:
        return jsonify({"error": "An 'ip' is required."}), 400
    return jsonify(db.block_ip(ip, data.get("reason")))


@dlt_bp.route("/admin/blocked-ips/<ip>", methods=["DELETE"])
def dlt_unblock_ip(ip):
    removed = db.unblock_ip(ip)
    return jsonify({"removed": removed, "ip": ip})


@dlt_bp.route("/admin/report", methods=["GET"])
def dlt_report():
    """Download the alert log as CSV / Excel / PDF."""
    fmt = request.args.get("format", default="csv")
    session_id = request.args.get("session_id")
    try:
        content, mime, ext = reports.build(fmt, session_id=session_id)
    except (RuntimeError, ValueError) as e:
        return jsonify({"error": str(e)}), 400
    filename = f"ews_alert_report_{time.strftime('%Y%m%d_%H%M%S')}.{ext}"
    return Response(
        content, mimetype=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Admin: email notifications ──────────────────────────────────────────────

def _valid_email(addr):
    return bool(addr) and "@" in addr and "." in addr.split("@")[-1]


@dlt_bp.route("/admin/email", methods=["GET"])
def dlt_email_settings():
    """Email config + admin-managed recipients + on/off state."""
    return jsonify(notifier.settings_summary())


@dlt_bp.route("/admin/email/recipients", methods=["POST"])
def dlt_add_email_recipient():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    if not _valid_email(email):
        return jsonify({"error": "A valid email address is required."}), 400
    db.add_email_recipient(email)
    return jsonify(notifier.settings_summary())


@dlt_bp.route("/admin/email/recipients/<path:email>", methods=["DELETE"])
def dlt_remove_email_recipient(email):
    db.remove_email_recipient(email)
    return jsonify(notifier.settings_summary())


@dlt_bp.route("/admin/email/toggle", methods=["POST"])
def dlt_toggle_email():
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled"))
    notifier.set_email_enabled(enabled)
    return jsonify(notifier.settings_summary())


@dlt_bp.route("/admin/email/test", methods=["POST"])
def dlt_test_email():
    data = request.get_json(silent=True) or {}
    to = (data.get("to") or "").strip() or None
    if to and not _valid_email(to):
        return jsonify({"error": "Invalid test recipient."}), 400
    # Always 200: a test is a status report. The {sent, reason} body tells the UI
    # whether it worked (e.g. "SMTP not configured") instead of surfacing a bare
    # "Request failed with status code 400".
    return jsonify(notifier.send_test(to))
