# Sketch2Life - Backend + Frontend (works on any WLAN / hotspot)
param(
    [switch]$NoBrowser,
    [switch]$SmokeTest
)

$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$printService = Join-Path $root "print-service"

. (Join-Path $root "scripts\workshop-common.ps1")

$python = Get-BackendPython -Root $root
$printPython = Get-PrintPython -Root $root

if (-not (Test-Path $python)) {
    Write-Host "Backend venv missing. Run once:" -ForegroundColor Yellow
    Write-Host "  .\setup.ps1"
    exit 1
}

Stop-PortListeners -Ports @(8000, 3005, 5173, 5174)
Ensure-FirewallRules -ProjectRoot $root

$envFile = Join-Path $backend ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $backend ".env.example") $envFile
    Write-Host "Created backend/.env from template - add your Meshy API_KEY before generating." -ForegroundColor Yellow
} else {
    $apiKeyLine = Get-Content $envFile | Where-Object { $_ -match '^\s*API_KEY=' } | Select-Object -First 1
    if (-not $apiKeyLine -or $apiKeyLine -match 'API_KEY=\s*$' -or $apiKeyLine -match 'your_meshy_key_here') {
        Write-Host "WARNING: backend/.env has no valid API_KEY - 3D generation will fail." -ForegroundColor Red
        Write-Host "         Run .\setup.ps1 or edit backend/.env (Meshy key from https://www.meshy.ai/)" -ForegroundColor Yellow
    }
}

$net = Get-WorkshopLanIp
$lanIp = $net.Ip
$publicOrigin = "http://${lanIp}:5173"
$backendPublicUrl = "http://${lanIp}:8000"

Write-Host ""
Write-Host "=== Sketch2Life Workshop Start ===" -ForegroundColor Cyan
Write-Host ""

if ($net.Kind -eq "hotspot") {
    Write-Host "Hotspot IP: $lanIp" -ForegroundColor Green
    Write-Host "Students: connect phones to THIS hotspot, then scan the QR code." -ForegroundColor Green
} elseif ($net.Kind -eq "lan") {
    Write-Host "LAN IP: $lanIp" -ForegroundColor Green
    Write-Host "Phones on the same network can open the QR link." -ForegroundColor Green
} else {
    Write-Host "WARNING: No LAN/hotspot IP detected - using localhost only." -ForegroundColor Yellow
    Write-Host "For phone testing: enable Windows mobile hotspot or connect to any WLAN." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "All services bind to 0.0.0.0 (reachable on any local network)." -ForegroundColor DarkCyan
Write-Host "Phone URL for QR: $publicOrigin" -ForegroundColor Cyan
Write-Host ""

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$backend'; `$env:PRINT_API_URL='http://127.0.0.1:3005'; Write-Host '3D Backend: http://127.0.0.1:8000/docs' -ForegroundColor Cyan; & '$python' -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload"
)

Start-Sleep -Seconds 2

if (Test-Path $printPython) {
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "cd '$printService'; `$env:SERVICE_HOST='0.0.0.0'; `$env:RELOAD='false'; Write-Host 'Print service: http://0.0.0.0:3005/docs' -ForegroundColor Cyan; & '$printPython' run.py"
    )
    Start-Sleep -Seconds 2
} else {
    Write-Host "Print service venv missing. Run: .\setup.ps1" -ForegroundColor Yellow
    Write-Host ""
}

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$env:VITE_PUBLIC_ORIGIN='$publicOrigin'; `$env:VITE_KI_PUBLIC_URL='$backendPublicUrl'; cd '$frontend'; Write-Host 'Frontend: http://localhost:5173' -ForegroundColor Cyan; Write-Host 'Phone URL: $publicOrigin' -ForegroundColor DarkCyan; npm run dev"
)

Write-Host "Services started." -ForegroundColor Green
Write-Host "3D backend:    http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host "Print service: http://127.0.0.1:3005/docs (MOCK_PRINTER=true in print-service/.env)" -ForegroundColor Green
Write-Host "Frontend:      http://localhost:5173" -ForegroundColor Green
Write-Host "Phone URL:     $publicOrigin" -ForegroundColor Green
Write-Host "Print file:    print-service\data\print_requests.json" -ForegroundColor Green
Write-Host ""

if ($SmokeTest) {
    Write-Host ""
    & (Join-Path $root "smoke-test.ps1")
}
