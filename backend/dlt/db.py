"""
SQLite persistence for the EWS IPS engine (alerts, blocked IPs, recipients, settings).

Stores every graded alert (LOW/MED/HIGH) produced by the pipeline plus the set
of admin-blocked IPs, and provides the aggregation queries the Dashboard,
Alert History, and Statistics pages read.

Why SQLite: the engine is a single Flask process with in-memory job state, so a
file-backed, zero-config store is the right fit — no server to run, and the whole
DB lives next to the results in backend/dlt_results/alerts.db. Every DB call opens
its own short-lived connection (check_same_thread=False is unnecessary that way),
which keeps it safe to call from the background analysis/capture threads in
service.py. To move to MySQL, only this module needs to change.
"""
import sqlite3
import threading

from dlt import paths

# Writable DB location (beside the .exe when frozen, in backend/ in dev).
DB_PATH = paths.DB_PATH

# Serialize writes across the background threads (uploads reveal, live re-analyze,
# final pass) so concurrent inserts can't interleave mid-transaction.
_write_lock = threading.Lock()


def _connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create tables if they don't exist. Safe to call on every import."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id     TEXT NOT NULL,
                second         INTEGER,
                timestamp      TEXT,
                source_ip      TEXT,
                destination_ip TEXT,
                source_port    TEXT,
                destination_port TEXT,
                protocol       TEXT,
                attack_type    TEXT,
                confidence     REAL,
                level          TEXT NOT NULL,
                score          REAL,
                source         TEXT,               -- 'upload' | 'live'
                created_at     TEXT DEFAULT (datetime('now')),
                -- One alert per (session, second): a timestamp's severity is
                -- declared once and never overwritten by a later re-analysis.
                UNIQUE(session_id, second)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS blocked_ips (
                ip         TEXT PRIMARY KEY,
                reason     TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS email_recipients (
                email      TEXT PRIMARY KEY,
                created_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_session ON alerts(session_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at)")


# ── Alerts ────────────────────────────────────────────────────────────────────

def insert_alert(alert):
    """Insert one alert dict. Returns the new row id, or None if it was a
    duplicate (same session_id/second — deduped by the UNIQUE constraint, so a
    timestamp's alert is written once and never overwritten)."""
    with _write_lock, _connect() as conn:
        try:
            cur = conn.execute(
                """
                INSERT INTO alerts (session_id, second, timestamp, source_ip,
                    destination_ip, source_port, destination_port, protocol,
                    attack_type, confidence, level, score, source)
                VALUES (:session_id, :second, :timestamp, :source_ip,
                    :destination_ip, :source_port, :destination_port, :protocol,
                    :attack_type, :confidence, :level, :score, :source)
                """,
                {
                    "session_id": alert.get("session_id"),
                    "second": alert.get("second"),
                    "timestamp": alert.get("timestamp"),
                    "source_ip": alert.get("source_ip"),
                    "destination_ip": alert.get("destination_ip"),
                    "source_port": alert.get("source_port"),
                    "destination_port": alert.get("destination_port"),
                    "protocol": alert.get("protocol"),
                    "attack_type": alert.get("attack_type"),
                    "confidence": alert.get("confidence"),
                    "level": alert.get("level"),
                    "score": alert.get("score"),
                    "source": alert.get("source"),
                },
            )
            return cur.lastrowid
        except sqlite3.IntegrityError:
            return None


def list_alerts(limit=200, offset=0, level=None, session_id=None):
    """Most-recent-first alert history, optionally filtered by level/session."""
    clauses, params = [], []
    if level:
        clauses.append("level = ?")
        params.append(level)
    if session_id:
        clauses.append("session_id = ?")
        params.append(session_id)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.extend([limit, offset])
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM alerts {where} ORDER BY id DESC LIMIT ? OFFSET ?", params
        ).fetchall()
    return [dict(r) for r in rows]


def get_alert(alert_id):
    with _connect() as conn:
        row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    return dict(row) if row else None


def count_alerts(level=None, session_id=None):
    clauses, params = [], []
    if level:
        clauses.append("level = ?")
        params.append(level)
    if session_id:
        clauses.append("session_id = ?")
        params.append(session_id)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with _connect() as conn:
        return conn.execute(f"SELECT COUNT(*) FROM alerts {where}", params).fetchone()[0]


def latest_alert_level(session_id=None):
    """Level of the most recently inserted alert (drives the dashboard's
    'current threat level'), or None when there are no alerts."""
    where, params = ("WHERE session_id = ?", [session_id]) if session_id else ("", [])
    with _connect() as conn:
        row = conn.execute(
            f"SELECT level FROM alerts {where} ORDER BY id DESC LIMIT 1", params
        ).fetchone()
    return row["level"] if row else None


def level_breakdown(session_id=None):
    """{LOW: n, MED: n, HIGH: n} counts for the pie/bar charts."""
    where, params = ("WHERE session_id = ?", [session_id]) if session_id else ("", [])
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT level, COUNT(*) AS n FROM alerts {where} GROUP BY level", params
        ).fetchall()
    return {r["level"]: r["n"] for r in rows}


def attack_type_breakdown(session_id=None):
    where, params = ("WHERE session_id = ?", [session_id]) if session_id else ("", [])
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT COALESCE(attack_type,'Unknown') AS attack_type, COUNT(*) AS n "
            f"FROM alerts {where} GROUP BY attack_type ORDER BY n DESC", params
        ).fetchall()
    return [{"attack_type": r["attack_type"], "count": r["n"]} for r in rows]


def alerts_over_time(limit=100, session_id=None):
    """Recent alerts as an ordered series for the line chart (oldest→newest)."""
    where, params = ("WHERE session_id = ?", [session_id]) if session_id else ("", [])
    params = params + [limit]
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT id, second, timestamp, level, confidence, source_ip "
            f"FROM alerts {where} ORDER BY id DESC LIMIT ?", params
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


def top_source_ips(limit=10, session_id=None):
    """Busiest attacking source IPs (for the bar chart / topology). Ignores rows
    with no source IP (e.g. CSVs that lacked a SourceIP column)."""
    clauses = ["source_ip IS NOT NULL", "source_ip != ''"]
    params = []
    if session_id:
        clauses.insert(0, "session_id = ?")
        params.append(session_id)
    where = "WHERE " + " AND ".join(clauses)
    params.append(limit)
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT source_ip, COUNT(*) AS n FROM alerts {where} "
            f"GROUP BY source_ip ORDER BY n DESC LIMIT ?", params
        ).fetchall()
    return [{"source_ip": r["source_ip"], "count": r["n"]} for r in rows]


# ── Blocked IPs ─────────────────────────────────────────────────────────────

def list_blocked_ips():
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM blocked_ips ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def block_ip(ip, reason=None):
    with _write_lock, _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO blocked_ips (ip, reason) VALUES (?, ?)", (ip, reason)
        )
    return {"ip": ip, "reason": reason}


def unblock_ip(ip):
    with _write_lock, _connect() as conn:
        cur = conn.execute("DELETE FROM blocked_ips WHERE ip = ?", (ip,))
        return cur.rowcount > 0


def is_blocked(ip):
    with _connect() as conn:
        return conn.execute("SELECT 1 FROM blocked_ips WHERE ip = ?", (ip,)).fetchone() is not None


# ── Email recipients ────────────────────────────────────────────────────────

def list_email_recipients():
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM email_recipients ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def add_email_recipient(email):
    with _write_lock, _connect() as conn:
        conn.execute("INSERT OR REPLACE INTO email_recipients (email) VALUES (?)", (email,))
    return {"email": email}


def remove_email_recipient(email):
    with _write_lock, _connect() as conn:
        cur = conn.execute("DELETE FROM email_recipients WHERE email = ?", (email,))
        return cur.rowcount > 0


# ── Settings (key/value) ────────────────────────────────────────────────────

def get_setting(key, default=None):
    with _connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key, value):
    with _write_lock, _connect() as conn:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    return {"key": key, "value": str(value)}


init_db()
