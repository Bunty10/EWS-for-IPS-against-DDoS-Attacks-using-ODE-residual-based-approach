"""
Alert-report generation in CSV, Excel (.xlsx) and PDF.

CSV uses only the standard library. Excel needs `openpyxl` and PDF needs
`reportlab`; both are optional — if the library isn't installed the function
raises a clear error the route turns into a 400, so the server still runs with a
bare install and only the extra formats are unavailable.
"""
import csv
import io
from datetime import datetime

from dlt import db

_COLUMNS = [
    ("id", "ID"),
    ("created_at", "Logged At"),
    ("timestamp", "Traffic Timestamp"),
    ("source_ip", "Source IP"),
    ("destination_ip", "Destination IP"),
    ("protocol", "Protocol"),
    ("attack_type", "Attack Type"),
    ("level", "Severity"),
    ("confidence", "Confidence"),
    ("source", "Origin"),
]


def _rows(session_id=None):
    return db.list_alerts(limit=100000, session_id=session_id)


def _cell(row, field):
    val = row.get(field)
    if field == "confidence" and isinstance(val, (int, float)):
        return f"{round(val * 100)}%"
    return "" if val is None else val


def build_csv(session_id=None):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([h for _, h in _COLUMNS])
    for row in _rows(session_id):
        writer.writerow([_cell(row, f) for f, _ in _COLUMNS])
    return buf.getvalue().encode("utf-8"), "text/csv", "csv"


def build_xlsx(session_id=None):
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
    except ImportError as e:
        raise RuntimeError("Excel export requires openpyxl (pip install openpyxl).") from e

    wb = Workbook()
    ws = wb.active
    ws.title = "Alerts"
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="0F766E")
    ws.append([h for _, h in _COLUMNS])
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
    for row in _rows(session_id):
        ws.append([_cell(row, f) for f, _ in _COLUMNS])
    for i, (_, header) in enumerate(_COLUMNS, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = max(12, len(header) + 2)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"


def build_pdf(session_id=None):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import landscape, A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    except ImportError as e:
        raise RuntimeError("PDF export requires reportlab (pip install reportlab).") from e

    rows = _rows(session_id)
    out = io.BytesIO()
    doc = SimpleDocTemplate(out, pagesize=landscape(A4), title="EWS Alert Report")
    styles = getSampleStyleSheet()
    story = [
        Paragraph("EWS — DDoS Alert Report", styles["Title"]),
        Paragraph(f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} · {len(rows)} alerts", styles["Normal"]),
        Spacer(1, 12),
    ]
    data = [[h for _, h in _COLUMNS]]
    for row in rows:
        data.append([str(_cell(row, f)) for f, _ in _COLUMNS])
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F766E")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")]),
    ]))
    story.append(table)
    doc.build(story)
    return out.getvalue(), "application/pdf", "pdf"


def build(fmt, session_id=None):
    fmt = (fmt or "csv").lower()
    if fmt == "csv":
        return build_csv(session_id)
    if fmt in ("xlsx", "excel"):
        return build_xlsx(session_id)
    if fmt == "pdf":
        return build_pdf(session_id)
    raise ValueError(f"Unsupported report format: {fmt}")
