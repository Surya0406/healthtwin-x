# One-command launcher for HealthTwin X (Windows PowerShell).
# Usage: .\start.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$py = Join-Path $root '.venv\Scripts\python.exe'

if (-not (Test-Path $py)) {
    Write-Host 'Creating virtual environment (.venv)...'
    python -m venv (Join-Path $root '.venv')
    & $py -m pip install --upgrade pip
    & $py -m pip install -r (Join-Path $root 'requirements.txt')
}

if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) {
    Write-Host 'Installing frontend packages...'
    Push-Location (Join-Path $root 'frontend'); npm install; Pop-Location
}

Write-Host 'Starting API on http://localhost:8000 ...'
Start-Process -FilePath $py -WorkingDirectory $root -ArgumentList '-W','ignore','-m','uvicorn','backend.main:app','--port','8000'

Write-Host 'Starting dashboard on http://localhost:5173 ...'
Set-Location (Join-Path $root 'frontend')
npm run dev
