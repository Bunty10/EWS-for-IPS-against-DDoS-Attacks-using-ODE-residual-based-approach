"""
Desktop-app entrypoint for the Residual-based ODE EWS IPS app.

PyInstaller freezes this (windowed, no console) into Residual-based-ODE-EWS-IPS.exe. On launch it:
  1. loads .env (SMTP_* etc.) from beside the exe / the data dir / the cwd,
  2. auto-starts live traffic capture on a background thread,
  3. serves the API + bundled React GUI (waitress) on a background thread,
  4. shows the GUI in a NATIVE desktop window (pywebview) — no browser, no console.

The window opens on the Dashboard (the app's landing page). Backend threads are
daemons, so they stop when the window is closed. If pywebview is unavailable, it
falls back to serving + opening the default browser so the app still runs.

Live capture also resumes automatically after a manual CSV upload finishes
(handled in dlt/service.py).
"""
import os
import sys
import threading
import time
from pathlib import Path
from urllib.request import urlopen

WINDOW_TITLE = "Residual-based ODE EWS IPS"


def _exe_dir():
    if getattr(sys, "frozen", False):
        return Path(os.path.dirname(sys.executable))
    return Path(__file__).resolve().parent


def _load_env():
    """Load .env from beside the exe, the writable data dir, or the cwd."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    from dlt import paths
    for candidate in (_exe_dir() / ".env", paths.data_dir() / ".env", Path.cwd() / ".env"):
        try:
            if candidate.is_file():
                load_dotenv(dotenv_path=str(candidate))
                return
        except Exception:  # noqa: BLE001
            pass
    load_dotenv()  # default search


def _autostart_capture():
    """Start live capture shortly after boot (best-effort)."""
    time.sleep(1.5)
    try:
        from dlt import service
        service.start_live_capture()
    except Exception as e:  # noqa: BLE001
        print(f"[EWS] Live capture auto-start skipped: {e}")


def _serve(app, port):
    """Run the WSGI server (waitress preferred, Flask dev server fallback)."""
    try:
        from waitress import serve
        serve(app, host="127.0.0.1", port=port, threads=8)
    except ImportError:
        app.run(host="127.0.0.1", port=port, debug=False)


def _wait_for_server(port, timeout=30.0):
    """Block until the server answers, so the window doesn't load too early."""
    url = f"http://127.0.0.1:{port}/api/dlt"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urlopen(url, timeout=1).read()
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.3)
    return False


def main():
    _load_env()
    from dlt import logging_setup
    logging_setup.configure()
    port = int(os.environ.get("DLT_PORT", "5001"))

    # Import after env is loaded so config picks it up.
    from dlt_app import app

    # Background services: live capture + the web server.
    threading.Thread(target=_autostart_capture, daemon=True).start()
    threading.Thread(target=_serve, args=(app, port), daemon=True).start()

    _wait_for_server(port)
    url = f"http://127.0.0.1:{port}/"

    # Native desktop window (no browser, no console). Falls back to the browser
    # only if pywebview isn't available.
    try:
        import webview
        webview.create_window(WINDOW_TITLE, url, width=1400, height=900, min_size=(1024, 700))
        webview.start()
    except Exception as e:  # noqa: BLE001
        print(f"[EWS] Desktop window unavailable ({e}); opening in browser at {url}")
        try:
            import webbrowser
            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass
        # Keep the process alive serving in the background thread.
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
