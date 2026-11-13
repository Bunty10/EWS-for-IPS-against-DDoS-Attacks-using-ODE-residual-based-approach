@echo off
REM ============================================================================
REM  Build "Residual-based ODE EWS IPS" into a standalone Windows desktop app
REM  (windowed, no console) and a Windows installer.
REM
REM  Prerequisites (once):
REM    - Python 3.10+ on PATH
REM    - Node.js 18+ on PATH
REM    - Inno Setup (ISCC.exe on PATH) for the installer step
REM    - Npcap installed (https://npcap.com) for live packet capture at runtime
REM
REM  Usage:  double-click this file, or run  build.bat  from a terminal.
REM  Output: dist\Residual-based-ODE-EWS-IPS\Residual-based-ODE-EWS-IPS.exe
REM          installer_output\<InstallFolder>-Setup.exe
REM ============================================================================
setlocal
cd /d "%~dp0"

echo(
echo [1/4] Building the React frontend...
pushd frontend
call npm install || goto :error
call npm run build || goto :error
popd

echo(
echo [2/4] Installing backend + build dependencies...
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt -r backend\requirements-build.txt || goto :error

echo(
echo [3/4] Generating the app icon + packaging with PyInstaller (several minutes)...
python packaging\make_icon.py || goto :error
python -m PyInstaller ews.spec --noconfirm || goto :error

echo(
echo [4/4] Building the Windows installer with Inno Setup...
REM  Npcap is REQUIRED at runtime for live packet capture on client machines.
REM  Drop the Npcap installer (any file named npcap*.exe, e.g. npcap-1.82.exe) into
REM  installer\vendor\ so the setup bundles it and installs it on machines without it.
if not exist "installer\vendor\npcap*.exe" (
  echo(
  echo   WARNING: no installer\vendor\npcap*.exe found.
  echo   The setup will still build, but clients WITHOUT Npcap will not be able to
  echo   run live traffic capture. Download it from https://npcap.com and save it into
  echo   installer\vendor\ ^(any npcap*.exe name is fine^), then rebuild.
  echo(
)
where ISCC >nul 2>nul
if errorlevel 1 (
  echo(
  echo   Inno Setup compiler ^(ISCC.exe^) not found on PATH.
  echo   Install it from https://jrsoftware.org/isdl.php  or  choco install innosetup
  echo   Then run:  ISCC installer\ews.iss
  echo(
  echo   The standalone desktop app is ready now at:
  echo     dist\Residual-based-ODE-EWS-IPS\Residual-based-ODE-EWS-IPS.exe
  goto :eof
)
ISCC installer\ews.iss || goto :error

echo(
echo ============================================================================
echo  Build complete.
echo   Desktop app : dist\Residual-based-ODE-EWS-IPS\Residual-based-ODE-EWS-IPS.exe
echo   Installer   : installer_output\<InstallFolder>-Setup.exe
echo ============================================================================
goto :eof

:error
echo(
echo BUILD FAILED. See the output above for the error.
exit /b 1
