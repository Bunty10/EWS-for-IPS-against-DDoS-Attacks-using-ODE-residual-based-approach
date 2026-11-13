# Backend — Residual-based ODE engine & IPS

Flask service that scores network traffic for DDoS activity using a **residual
system-identification** pipeline, persists graded alerts to SQLite, and drives
the security dashboard. It runs as its own process on **port 5001** and exposes
everything under `/api/dlt/*`.

The per-second feature trajectory of **benign-only** traffic is modelled as a
linear dynamical system (a system matrix `Az` fitted by least squares). At test
time each 1-second bin is scored by the summed **PINN + Laplace residuals** of
that fit; scores crossing the trained thresholds become graded alerts (`LOW` /
`MED` / `HIGH`). The core is **NumPy-only** — there is **no neural network and no
PyTorch dependency**, and no trainable model is persisted — just the
benign-baseline thresholds.

---

## File structure

```
backend/
├── dlt_app.py          Flask entrypoint — API on :5001; also serves the built SPA in prod
├── launch.py           Desktop-app entrypoint — native window + waitress + auto-capture
├── requirements.txt    Runtime dependencies (NumPy-only core, no torch)
├── requirements-build.txt   extra deps for the PyInstaller/desktop build
├── .env.example        template for SMTP_* email settings
├── dlt/
│   ├── __init__.py     package overview
│   ├── routes.py       Flask blueprint — every /api/dlt/* endpoint
│   ├── service.py      orchestration: job/live-session state, threading, freezing, exports
│   ├── pipeline.py     facade over the detection engine (shared constants + run_* calls)
│   ├── approach_residual.py  PINN/Laplace residual scoring (train / test), NumPy only
│   ├── preprocessing.py      shared feature pipeline: clean → aggregate → label → grade
│   ├── live_capture.py scapy packet sniffing → flow feature rows → CSV
│   ├── db.py           SQLite persistence (alerts, blocked IPs, recipients, settings)
│   ├── notifier.py     HIGH-alert email over SMTP
│   ├── recommendations.py  alert-level → recommended-action mapping
│   ├── reports.py      alert-log export in CSV / Excel / PDF
│   ├── ml_info.py      static description of the detection engine (ML Info page)
│   ├── protocols.py    IP protocol number → name (6 → TCP, 17 → UDP, ...)
│   └── paths.py        dev vs. frozen-exe filesystem paths
├── models/residual/    pre-trained thresholds (loaded at test time)
│   ├── thresholds_VNRVJIET.pkl     LOW/MED/HIGH thresholds (LIVE)
│   └── thresholds_CICDDoS2019.pkl  LOW/MED/HIGH thresholds (CSV)
├── dlt_uploads/        uploaded CSVs are saved here as test.csv
└── dlt_results/        alerts.db (SQLite) + results.json + exported/live CSVs
```

### Module responsibilities

| Module | Purpose |
|--------|---------|
| **`dlt_app.py`** | Flask entrypoint. Enables CORS for `/api/*`, registers the `dlt` blueprint, runs on `DLT_PORT` (default `5001`). When a built frontend is bundled beside it (`paths.FRONTEND_DIR`), the **same process also serves the SPA** (no CORS, no proxy). |
| **`launch.py`** | Packaged desktop entrypoint (frozen by PyInstaller). Loads `.env`, auto-starts live capture, serves the API + bundled GUI with **waitress**, and shows the app in a **native window** (pywebview / Edge WebView2), falling back to the browser if unavailable. |
| **`dlt/routes.py`** | The HTTP surface. Thin handlers that validate input and delegate to `service.py`, `db.py`, `notifier.py`, `reports.py`, etc. |
| **`dlt/service.py`** | Holds in-memory job/progress state and the **frozen per-second live store**, runs analysis on background threads, freezes each capture second's alert exactly once, drives progressive result reveal for uploads, and computes the dashboard / statistics / topology views. |
| **`dlt/pipeline.py`** | Thin facade over the detection engine: re-exports the shared feature constants and forwards `run_test_only` / `run_train_only` / `resolve_model_set` to `approach_residual`. |
| **`dlt/approach_residual.py`** | The scoring engine. `run_train_only` (fit on benign, derive thresholds, pickle thresholds), `run_test_only(mode=...)` (load the mode's thresholds, re-fit the system matrix on the data, score each second by its residual, build metrics). NumPy only — no model is persisted. |
| **`dlt/preprocessing.py`** | Shared feature pipeline: cleans columns, aggregates flows into **1-second bins**, derives an adaptive `DDoS`/`BENIGN` label from the attack ratio (default `0.07`), and grades scores against thresholds. The 27-feature list is fixed in `FEATURES`. |
| **`dlt/live_capture.py`** | Uses scapy `sniff` in a background thread, aggregates packets into flows keyed by `(src_ip, dst_ip, proto, src_port, dst_port)`, and converts them into the feature rows the pipeline expects. |
| **`dlt/db.py`** | SQLite persistence. Stores every graded alert (deduped as one per `session_id`+`second`), blocked IPs, email recipients, and settings. |
| **`dlt/notifier.py`** | Sends HIGH-alert emails over SMTP (STARTTLS or SSL). A missing/disabled transport is a logged no-op — never breaks analysis. |
| **`dlt/reports.py`** | Builds the alert log as CSV (stdlib), Excel (`openpyxl`), or PDF (`reportlab`). |
| **`dlt/paths.py`** | Resolves read-only bundled assets (models, frontend) vs. writable state (DB, uploads, results) so paths work in dev and inside a frozen exe. |

---

## API routes

All routes are mounted under `/api/dlt` (blueprint in `dlt/routes.py`).

### Analysis workflow

| Method | Route | Description |
|--------|-------|-------------|
| `GET`  | `/api/dlt` | Health check. |
| `POST` | `/api/dlt/upload` | Upload a CSV (form field `file`). Saves it, starts analysis on a background thread, returns immediately. |
| `GET`  | `/api/dlt/status` | **Polled ~1×/s.** Full job state: `status`, `progress`, `capture`, and the (possibly partial) `result`. |
| `GET`  | `/api/dlt/results` | Final results only (`404` if none yet). |
| `POST` | `/api/dlt/capture/start` | Begin live packet capture. |
| `POST` | `/api/dlt/capture/stop` | Stop → save flows → run the final analysis → return results. |
| `GET`  | `/api/dlt/capture/preview` | Lightweight packet/byte counters while capturing. |
| `POST` | `/api/dlt/export` | Write the per-second table to a CSV under `dlt_results/`. |
| `POST` | `/api/dlt/reset` | Return the engine to a clean `idle` state. |
| `GET`  | `/api/dlt/storage` | Resolved results/uploads/DB paths + CSV files present. |

### Dashboard, monitoring & analytics

| Method | Route | Description |
|--------|-------|-------------|
| `GET`  | `/api/dlt/dashboard` | Key metrics for the homepage, scoped to the current live session. |
| `GET`  | `/api/dlt/live/monitor` | Newest-first rows for the Live table (`?limit=`). |
| `GET`  | `/api/dlt/statistics` | Chart data (level breakdown, attack types, over-time, top sources). |
| `GET`  | `/api/dlt/topology` | Live source→network topology. |
| `GET`  | `/api/dlt/recommendations` | The LOW/MED/HIGH recommended-action reference. |
| `GET`  | `/api/dlt/ml-info` | Description of the detection engine (kept in sync with the pipeline). |
| `GET`  | `/api/dlt/model-info` | Baseline selection: LIVE→VNRVJIET, CSV→CICDDoS2019, last-used set, on-disk availability. |

### Alerts & admin

| Method | Route | Description |
|--------|-------|-------------|
| `GET`    | `/api/dlt/alerts` | Alert history (`?limit=&offset=&level=&session_id=`). |
| `GET`    | `/api/dlt/alerts/<id>` | One alert's details + the recommendation for its severity. |
| `GET`/`POST`/`DELETE` | `/api/dlt/admin/blocked-ips[/...]` | List / block / unblock IPs. |
| `GET`    | `/api/dlt/admin/report` | Download the alert log — `?format=csv\|xlsx\|pdf`. |
| `GET`/`POST`/`DELETE` | `/api/dlt/admin/email[/...]` | Email settings, recipients, on/off toggle, test send. |

---

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

python dlt_app.py                 # http://127.0.0.1:5001/api/dlt/*
```

Override the port with the `DLT_PORT` environment variable.

---

## Training vs. testing

The running server uses the engine in **test/inference mode** — the pre-trained
thresholds in `models/residual/` are loaded and applied. The two pipeline paths
(`dlt/approach_residual.py`) are:

- **`run_train_only(train_df, results, models)`** — aggregates traffic, keeps
  **BENIGN only**, fits the linear system matrix `Az`, computes the per-second
  PINN + Laplace residual score, derives thresholds as `mean + k·std` for
  `k = 1, 2, 3` (`LOW`/`MED`/`HIGH`), and **pickles the thresholds**. No model is
  produced.
- **`run_test_only(test_df, results, models, mode=...)`** — loads the **mode's**
  thresholds (LIVE→VNRVJIET, CSV→CICDDoS2019), re-fits the system matrix on the
  test data, scores each second by its residual, and computes detection rate,
  false-positive rate, alert counts and the peak second. This is what `/upload`
  and `/capture/stop` call.

---

## Live-capture behaviour (the IPS rule)

During live capture, `service.py` re-runs the pipeline over a snapshot of the
flows seen so far, but **freezes each second's early-warning level the first time
that second appears** — later ticks (which re-fit over more data) never change an
already-graded timestamp. All live reads and the Alert History derive from this
frozen store, and each second is persisted as **at most one alert**.

---

## Storage

Writable data location (`dlt/paths.py`), in resolution order:

| Context | `dlt_results/` location |
|---------|-------------------------|
| `EWS_DATA_DIR` set | `<EWS_DATA_DIR>/dlt_results/` |
| Packaged `.exe` | `%LOCALAPPDATA%\<install-folder>\dlt_results\` |
| Development | `backend/dlt_results/` |

`models/residual/` and the bundled frontend stay read-only inside the PyInstaller
bundle. There is no model pickle — the system matrix is re-fitted from the data
at analysis time. `dlt_results/alerts.db` holds graded alerts, blocked IPs,
recipients and settings.

---

## Email notifications

Configure the SMTP transport with environment variables (a `.env` file is loaded
automatically when `python-dotenv` is installed). Recipients and the on/off
toggle are managed at runtime from the **Admin** panel. Only **HIGH** alerts are
emailed.

| Variable | Meaning |
|----------|---------|
| `SMTP_HOST` | SMTP server hostname (**enables** the transport when set). |
| `SMTP_PORT` | SMTP port (default `587` STARTTLS, or `465` with `SMTP_USE_SSL=1`). |
| `SMTP_USER` / `SMTP_PASS` | SMTP credentials. |
| `ALERT_EMAIL_FROM` | From address (default: `SMTP_USER`). |
| `ALERT_EMAIL_TO` | Comma-separated recipients to seed. |
| `SMTP_USE_SSL` | `1` to use SMTPS (port 465) instead of STARTTLS. |

---

## Live-capture note

scapy requires OS-level capture privileges — run with `sudo` on Linux/macOS, or
install Npcap and run as Administrator on Windows.
