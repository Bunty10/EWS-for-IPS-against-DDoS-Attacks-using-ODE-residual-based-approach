# DLT-NN IDS Backend Setup Script
# Fixes: pip install errors (torch, venv compatibility)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$venvPath = Join-Path $projectRoot "venv"

Write-Host "=== DLT-NN IDS Backend Setup ===" -ForegroundColor Cyan

# Step 1: Remove old venv if it exists (fixes pkgutil.ImpImporter / Python 3.12)
if (Test-Path $venvPath) {
    Write-Host "Removing old venv (may have compatibility issues)..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $venvPath -ErrorAction SilentlyContinue
}

# Step 2: Create fresh venv
Write-Host "Creating new virtual environment..." -ForegroundColor Yellow
python -m venv $venvPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create venv. Make sure Python 3.8+ is installed." -ForegroundColor Red
    exit 1
}

# Step 3: Activate and upgrade pip
$pipExe = Join-Path $venvPath "Scripts\pip.exe"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"

Write-Host "Upgrading pip..." -ForegroundColor Yellow
& $pythonExe -m pip install --upgrade pip setuptools

# Step 4: Install requirements (except torch first - avoids script path issues)
Write-Host "Installing Flask, pandas, numpy, scikit-learn, scipy..." -ForegroundColor Yellow
& $pipExe install "flask>=3.0.0" "flask-cors>=4.0.0" "pandas>=2.0.0" "numpy>=1.24.0" "scikit-learn>=1.3.0" "scipy>=1.10.0"

# Step 5: Install PyTorch (CPU version - smaller, fewer Windows install issues)
Write-Host "Installing PyTorch (CPU) - this may take a few minutes..." -ForegroundColor Yellow
& $pipExe install torch --index-url https://download.pytorch.org/whl/cpu

if ($LASTEXITCODE -ne 0) {
    Write-Host "PyTorch CPU install failed. Trying default PyTorch..." -ForegroundColor Yellow
    & $pipExe install "torch>=2.0.0"
}

Write-Host ""
Write-Host "=== Setup complete! ===" -ForegroundColor Green
Write-Host "To run the backend:"
Write-Host "  1. Activate:  ..\venv\Scripts\Activate.ps1"
Write-Host "  2. Run:       python app.py"
Write-Host ""
