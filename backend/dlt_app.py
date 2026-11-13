"""
Flask entrypoint for the EWS IPS engine.

In development this serves only the JSON API on port 5001; the Vite dev server
serves the React GUI and proxies /api/dlt to here.

In the packaged executable (and any prod deploy) the built React app is bundled
next to the code (paths.FRONTEND_DIR), and this same process ALSO serves that
single-page app — so one process serves both the GUI and the API, and the
frontend's relative /api/dlt calls hit the same origin (no CORS, no proxy).
See launch.py for the packaged entrypoint (auto-start capture + open browser).
"""
import os

# Load environment variables from a local .env (SMTP_* etc.) if python-dotenv is
# installed. Optional — real environment variables work without it.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from dlt import logging_setup
logging_setup.configure()

from dlt.routes import dlt_bp
from dlt import paths

app = Flask(__name__, static_folder=None)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.register_blueprint(dlt_bp)


@app.route("/api/dlt")
def dlt_home():
    return jsonify({"message": "EWS IPS engine running", "routes": "/api/dlt/*"})


# ── Serve the built React SPA (only when a build is bundled) ─────────────────
_FRONTEND_DIR = str(paths.FRONTEND_DIR)


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    """Serve the bundled frontend. Real files are returned as-is; any other route
    falls back to index.html so client-side routing (React Router) works."""
    if path.startswith("api/"):
        # No API route matched — let Flask return a normal 404 for the API.
        return jsonify({"error": "Not found"}), 404
    if not os.path.isdir(_FRONTEND_DIR):
        # No frontend bundled (dev mode): behave like the old API-only server.
        return jsonify({"message": "EWS IPS engine running", "routes": "/api/dlt/*"})
    full = os.path.join(_FRONTEND_DIR, path)
    if path and os.path.isfile(full):
        return send_from_directory(_FRONTEND_DIR, path)
    return send_from_directory(_FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("DLT_PORT", "5001"))
    app.run(debug=False, port=port)
