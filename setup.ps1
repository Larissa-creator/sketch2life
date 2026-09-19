# Sketch2Life — one-time setup (run from project root)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Find-Python {
    $fromPath = $null
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { $fromPath = $cmd.Source }
    $candidates = @(
        $fromPath,
        "$env:LOCALAPPDATA\Programs\Python\Python314\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
    if ($candidates) { return $candidates[0] }
    throw "Python not found. Install Python 3.10+ and add it to PATH."
}

function Setup-PythonService {
    param(
        [string]$Name,
        [string]$Dir
    )
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    if (-not (Test-Path $Dir)) {
        throw "Folder missing: $Dir"
    }

    $venvPython = Join-Path $Dir ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "Creating virtual environment..."
        & $script:py -m venv (Join-Path $Dir ".venv")
    }

    Write-Host "Installing Python packages..."
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r (Join-Path $Dir "requirements.txt")
    Write-Host "$Name ready." -ForegroundColor Green
}

function Ensure-ProjectDirs {
    param([string]$Root)
    $dirs = @(
        "backend\storage",
        "backend\storage\sketches",
        "backend\storage\models",
        "backend\storage\print",
        "backend\storage\meta",
        "print-service\data",
        "print-service\logs",
        "print-service\outputs"
    )
    foreach ($rel in $dirs) {
        $path = Join-Path $Root $rel
        if (-not (Test-Path $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }

    $indexPath = Join-Path $Root "backend\storage\index.json"
    if (-not (Test-Path $indexPath)) {
        '{"entries":[]}' | Set-Content -Path $indexPath -Encoding utf8
    }

    $requestsPath = Join-Path $Root "print-service\data\print_requests.json"
    if (-not (Test-Path $requestsPath)) {
        '{"requests":[]}' | Set-Content -Path $requestsPath -Encoding utf8
    }
}

Write-Host "Sketch2Life setup" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js not found. Install Node.js LTS from https://nodejs.org/"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm not found. Reinstall Node.js LTS."
}

$py = Find-Python
Write-Host "Using Python: $py" -ForegroundColor DarkGray

$backend = Join-Path $root "backend"
$print = Join-Path $root "print-service"
$frontend = Join-Path $root "frontend"

Ensure-ProjectDirs -Root $root

Setup-PythonService -Name "3D Generation Backend" -Dir $backend
Setup-PythonService -Name "Print Service" -Dir $print

$printEnv = Join-Path $print ".env"
$printExample = Join-Path $print ".env.example"
if (-not (Test-Path $printEnv) -and (Test-Path $printExample)) {
    Copy-Item $printExample $printEnv
    Write-Host "Created print-service/.env from .env.example" -ForegroundColor DarkGreen
}

$backendEnv = Join-Path $backend ".env"
$backendExample = Join-Path $backend ".env.example"
if (-not (Test-Path $backendEnv) -and (Test-Path $backendExample)) {
    Copy-Item $backendExample $backendEnv
    Write-Host "Created backend/.env from .env.example — add your Meshy API_KEY." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Frontend + AR ===" -ForegroundColor Cyan
Push-Location $frontend
npm install
Pop-Location
Write-Host "Frontend ready." -ForegroundColor Green

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  1. Set API_KEY in backend\.env"
Write-Host "  2. Run .\start-dev.ps1"
Write-Host "  3. Open http://localhost:5173"
