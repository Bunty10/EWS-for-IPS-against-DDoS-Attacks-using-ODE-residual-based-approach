# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Residual-based ODE EWS IPS.

Builds a windowed one-folder desktop app
(dist/Residual-based-ODE-EWS-IPS/Residual-based-ODE-EWS-IPS.exe) that bundles:
  - the Flask backend (backend/launch.py + the dlt package),
  - the pre-trained models (backend/models -> bundled as 'models'),
  - the built React GUI (frontend/dist -> bundled as 'frontend_dist').

Build from the repo root on Windows (build.bat wraps this after building the
frontend and generating the icon):
    pyinstaller ews.spec --noconfirm
"""
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules, collect_data_files

APP_NAME = "Residual-based-ODE-EWS-IPS"

ROOT = os.path.abspath(os.getcwd())
BACKEND = os.path.join(ROOT, "backend")
FRONTEND_DIST = os.path.join(ROOT, "frontend", "dist")
ICON = os.path.join(ROOT, "packaging", "icon.ico")

datas = []
binaries = []
hiddenimports = []

# Heavy third-party packages need their data files, DLLs and submodules collected.
# certifi ships the CA bundle used for SMTP TLS in the frozen build.
for pkg in ("sklearn", "scipy", "scapy", "pandas", "numpy",
            "openpyxl", "reportlab", "waitress", "flask_cors", "webview", "certifi"):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception as e:  # pragma: no cover - a missing optional pkg is fine
        print(f"[ews.spec] collect_all skipped for {pkg}: {e}")

# Scapy is import-heavy and lazy-loads layers/arch modules; make sure they are all
# bundled so live packet capture works in the frozen app (not just in dev).
hiddenimports += collect_submodules("scapy")
datas += collect_data_files("scapy")
hiddenimports += [
    "scapy.layers.inet", "scapy.layers.inet6", "scapy.layers.l2",
    "scapy.layers.dns", "scapy.arch", "scapy.arch.windows",
    # pcap providers scapy binds to at runtime for live capture — bundling these
    # is what makes sniff() work in the frozen app on a client PC (given Npcap is
    # installed there). The installer installs Npcap; these modules load it.
    "scapy.arch.windows.native", "scapy.arch.libpcap", "scapy.libs.winpcapy",
]

# Our own package + read-only bundled assets.
hiddenimports += collect_submodules("dlt")
datas += [
    (os.path.join(BACKEND, "models"), "models"),
    (FRONTEND_DIST, "frontend_dist"),
]

a = Analysis(
    [os.path.join(BACKEND, "launch.py")],
    pathex=[BACKEND],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib"],
    noarchive=False,
)

pyz = PYZ(a.pure)

# One-folder build. Better for an installer than one-file: no per-launch temp
# extraction, so the app starts fast once installed. Inno Setup packages the folder.
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,     # one-folder: binaries/datas go in COLLECT below
    name=APP_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,             # windowed — hides the CMD console on launch
    uac_admin=True,            # request admin so Npcap packet capture works
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=ICON if os.path.isfile(ICON) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name=APP_NAME,
)
