# Show workshop URL for phones and optionally save a QR code PNG.
# The app home page generates the same QR automatically at runtime.
#
# Usage:
#   .\show-workshop-qr.ps1
#   .\show-workshop-qr.ps1 -SavePng

param(
    [switch]$SavePng
)

$root = $PSScriptRoot
$frontend = Join-Path $root "frontend"

function Get-WorkshopLanIp {
    $all = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.PrefixOrigin -ne "WellKnown"
        }

    $hotspot = $all | Where-Object { $_.IPAddress -like "192.168.137.*" } |
        Select-Object -First 1
    if ($hotspot) { return @{ Ip = $hotspot.IPAddress; Kind = "hotspot" } }

    $private = $all | Where-Object {
        $_.IPAddress -match "^192\.168\." -or
        $_.IPAddress -match "^10\." -or
        $_.IPAddress -match "^172\.(1[6-9]|2\d|3[01])\."
    } | Sort-Object SkipAsSource, InterfaceMetric | Select-Object -First 1
    if ($private) { return @{ Ip = $private.IPAddress; Kind = "lan" } }

    $fallback = $all | Sort-Object SkipAsSource, InterfaceMetric | Select-Object -First 1
    if ($fallback) { return @{ Ip = $fallback.IPAddress; Kind = "public" } }

    return @{ Ip = "127.0.0.1"; Kind = "none" }
}

$net = Get-WorkshopLanIp
$url = "http://$($net.Ip):5173"

Write-Host ""
Write-Host "=== Sketch2Life workshop URL ===" -ForegroundColor Cyan
Write-Host ""

if ($net.Kind -eq "hotspot") {
    Write-Host "Network: Windows mobile hotspot" -ForegroundColor Green
} elseif ($net.Kind -eq "lan") {
    Write-Host "Network: LAN / classroom Wi-Fi" -ForegroundColor Green
} else {
    Write-Host "WARNING: No LAN IP found. Enable hotspot or connect to Wi-Fi first." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Phone URL (QR content):" -ForegroundColor White
Write-Host "  $url" -ForegroundColor Cyan
Write-Host ""
Write-Host "On the presenter PC, open:" -ForegroundColor White
Write-Host "  http://localhost:5173" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "The QR on the home page updates when you run .\start-dev.ps1" -ForegroundColor DarkGray
Write-Host ""

if ($SavePng) {
    $outPath = Join-Path $root "workshop-qr.png"
    $genScript = Join-Path $root "scripts\generate-workshop-qr.js"
    if (-not (Test-Path (Join-Path $frontend "node_modules\qrcode"))) {
        Write-Host "Cannot save PNG: run .\setup.ps1 first." -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $genScript)) {
        Write-Host "Missing script: $genScript" -ForegroundColor Red
        exit 1
    }

    Push-Location $root
    try {
        & node $genScript $url $outPath | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "QR PNG saved: $outPath" -ForegroundColor Green
        } else {
            Write-Host "Failed to generate PNG." -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
}
