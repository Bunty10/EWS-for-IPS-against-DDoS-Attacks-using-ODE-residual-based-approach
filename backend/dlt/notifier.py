"""
Email notifications for HIGH-severity alerts.

Transport is configured via environment variables (no secrets in the repo).
Recipients and the on/off switch are managed at runtime from the Admin Panel and
stored in the database, and can also be seeded from an env var. When SMTP isn't
configured, notifications are disabled, or there are no recipients, sending is a
logged no-op rather than an error — the analysis pipeline is never affected.

Environment variables:
    SMTP_HOST        SMTP server hostname (enables the transport when set)
    SMTP_PORT        SMTP port (default 587 STARTTLS, or 465 with SMTP_USE_SSL=1)
    SMTP_USER        SMTP username (also the default From address)
    SMTP_PASS        SMTP password / app-password
    ALERT_EMAIL_FROM From address (default: SMTP_USER)
    ALERT_EMAIL_TO   Comma-separated recipients to seed (admins can add more in UI)
    SMTP_USE_SSL     "1" to use SMTPS (port 465) instead of STARTTLS
"""
import os
import smtplib
import ssl
from email.message import EmailMessage

from dlt import recommendations
from dlt import db

_ENABLED_KEY = "email_enabled"


def is_configured():
    """True when an SMTP transport is configured (host set)."""
    return bool(os.environ.get("SMTP_HOST"))


def email_enabled():
    """Runtime on/off toggle (Admin Panel). Defaults to on."""
    return db.get_setting(_ENABLED_KEY, "1") == "1"


def set_email_enabled(enabled):
    db.set_setting(_ENABLED_KEY, "1" if enabled else "0")
    return email_enabled()


def _env_recipients():
    raw = os.environ.get("ALERT_EMAIL_TO", "")
    return [addr.strip() for addr in raw.split(",") if addr.strip()]


def effective_recipients():
    """Env-seeded recipients + admin-managed DB recipients, de-duplicated."""
    seen, out = set(), []
    for addr in _env_recipients() + [r["email"] for r in db.list_email_recipients()]:
        key = addr.lower()
        if key not in seen:
            seen.add(key)
            out.append(addr)
    return out


def settings_summary():
    """State for the Admin Panel email section."""
    return {
        "configured": is_configured(),
        "enabled": email_enabled(),
        "smtp_host": os.environ.get("SMTP_HOST") or None,
        "env_recipients": _env_recipients(),
        "recipients": db.list_email_recipients(),
        "effective_recipient_count": len(effective_recipients()),
    }


def _from_addr():
    return os.environ.get("ALERT_EMAIL_FROM") or os.environ.get("SMTP_USER") or "ews@localhost"


def _ssl_context():
    """A verifying SSL context. In a PyInstaller build the OS trust store may be
    unavailable, so fall back to certifi's CA bundle when it's installed — this is
    what makes TLS (Gmail/Office365) work in the packaged .exe."""
    ctx = ssl.create_default_context()
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except Exception:  # noqa: BLE001 - keep the default context if certifi is absent
        pass
    return ctx


def _send(msg):
    """Low-level send; raises on failure (callers wrap)."""
    host = os.environ["SMTP_HOST"]
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    use_ssl = os.environ.get("SMTP_USE_SSL") == "1"
    port = int(os.environ.get("SMTP_PORT", "465" if use_ssl else "587"))
    ctx = _ssl_context()

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as server:
            if user and password:
                server.login(user, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls(context=ctx)
            if user and password:
                server.login(user, password)
            server.send_message(msg)


def _build_message(alert, recipients):
    rec = recommendations.for_level(alert.get("level", "HIGH"))
    subject = f"[EWS IPS] HIGH severity alert from {alert.get('source_ip', 'unknown')}"
    lines = [
        "A HIGH-severity threat was detected by the EWS IPS engine.",
        "",
        f"Source IP:       {alert.get('source_ip', 'unknown')}",
        f"Destination IP:  {alert.get('destination_ip', 'unknown')}",
        f"Timestamp:       {alert.get('timestamp', 'unknown')}",
        f"Attack type:     {alert.get('attack_type', 'DDoS')}",
        f"Confidence:      {round((alert.get('confidence') or 0) * 100)}%",
        f"Severity:        {rec['severity']}",
        "",
        f"Recommendation:  {rec['headline']}",
    ]
    for action in rec["actions"]:
        lines.append(f"  - {action}")
    lines += ["", "Suggested immediate action: Block IP urgently."]

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = _from_addr()
    msg["To"] = ", ".join(recipients)
    msg.set_content("\n".join(lines))
    return msg


def send_high_alert(alert):
    """Send a HIGH-alert email to all effective recipients. Returns a status dict;
    never raises so a mail failure can't break analysis."""
    if not email_enabled():
        return {"sent": False, "reason": "email notifications disabled"}
    if not is_configured():
        return {"sent": False, "reason": "SMTP not configured"}
    recipients = effective_recipients()
    if not recipients:
        return {"sent": False, "reason": "no recipients"}
    try:
        _send(_build_message(alert, recipients))
        return {"sent": True, "recipients": recipients}
    except Exception as e:  # noqa: BLE001 - notification must never crash analysis
        return {"sent": False, "reason": str(e)}


def send_test(to=None):
    """Send a test email so an admin can confirm delivery. `to` overrides the
    recipient list; otherwise the effective recipients are used."""
    if not is_configured():
        return {"sent": False, "reason": "SMTP not configured"}
    recipients = [to] if to else effective_recipients()
    if not recipients:
        return {"sent": False, "reason": "no recipients"}
    try:
        msg = EmailMessage()
        msg["Subject"] = "[EWS IPS] Test notification"
        msg["From"] = _from_addr()
        msg["To"] = ", ".join(recipients)
        msg.set_content("This is a test email from the EWS IPS engine. "
                        "If you received it, HIGH-alert notifications are working.")
        _send(msg)
        return {"sent": True, "recipients": recipients}
    except Exception as e:  # noqa: BLE001
        return {"sent": False, "reason": str(e)}
