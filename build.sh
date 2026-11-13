#!/usr/bin/env bash
# ============================================================================
#  Build "Residual-based ODE EWS IPS" with PyInstaller.
#
#  NOTE: PyInstaller builds for the OS it runs on. Run this on WINDOWS to get a
#  Windows .exe (build.bat wraps the same steps and also builds the installer).
#  On Linux/macOS this produces a native binary in dist/ — useful for testing the
#  packaging, not a Windows .exe.
#
#  Output: dist/Residual-based-ODE-EWS-IPS/Residual-based-ODE-EWS-IPS (.exe on Windows)
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/3] Building the React frontend..."
( cd frontend && npm install && npm run build )

echo "[2/3] Installing backend + build dependencies..."
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt -r backend/requirements-build.txt

echo "[3/3] Generating the app icon + packaging with PyInstaller..."
python packaging/make_icon.py
python -m PyInstaller ews.spec --noconfirm

echo
echo "Desktop app built under dist/Residual-based-ODE-EWS-IPS/."
echo "The Windows installer step uses Inno Setup (ISCC), which is Windows-only —"
echo "run build.bat on Windows to also produce"
echo "the installer under installer_output/ (Residual-based-ODE-EWS-IPS-<version>-Setup.exe)."
