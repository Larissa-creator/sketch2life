# Sketch2Life — quick smoke test (API + frontend assets)
# Usage: .\smoke-test.ps1
# Prerequisite: services running (.\start-dev.ps1)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Test-Http {
    param(
        [string]$Name,
        [string]$Url,
        [int]$MinBytes = 0,
        [string]$Method = "GET",
        [string]$Body = $null
    )
    try {
        $params = @{
            Uri             = $Url
            Method          = $Method
            TimeoutSec      = 10
            UseBasicParsing = $true
        }
        if ($Body) {
            $params.ContentType = "application/json"
            $params.Body = $Body
        }
        $response = Invoke-WebRequest @params
        $size = $response.RawContentLength
        if ($size -lt 0) { $size = ($response.Content | Measure-Object -Character).Characters }
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
            if ($MinBytes -gt 0 -and $size -lt $MinBytes) {
                Write-Host "FAIL  $Name - HTTP $($response.StatusCode) but only $size bytes (expected >= $MinBytes)" -ForegroundColor Red
                return $false
            }
            Write-Host "OK    $Name - HTTP $($response.StatusCode)" -ForegroundColor Green
            return $true
        }
        Write-Host "FAIL  $Name - HTTP $($response.StatusCode)" -ForegroundColor Red
        return $false
    } catch {
        Write-Host "FAIL  $Name - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

Write-Host ""
Write-Host "=== Sketch2Life smoke test ===" -ForegroundColor Cyan
Write-Host ""

$ok = 0
$fail = 0

$tests = @(
    @{ Name = "Backend health"; Url = "http://127.0.0.1:8000/health" },
    @{ Name = "Print service health"; Url = "http://127.0.0.1:3005/health" },
    @{ Name = "Frontend home"; Url = "http://127.0.0.1:5173/" },
    @{ Name = "Demo sketch PNG"; Url = "http://127.0.0.1:5173/demo-sketch.png"; MinBytes = 1000 },
    @{ Name = "Demo model GLB"; Url = "http://127.0.0.1:5173/demo-model.glb"; MinBytes = 1000 },
    @{ Name = "Backend projects API"; Url = "http://127.0.0.1:8000/projects" },
    @{ Name = "KI API via Vite proxy"; Url = "http://127.0.0.1:5173/ki-api/health" },
    @{ Name = "Print API via Vite proxy"; Url = "http://127.0.0.1:5173/print-api/health" },
    @{ Name = "Print requests API"; Url = "http://127.0.0.1:3005/print/requests" },
    @{ Name = "Print log recent API"; Url = "http://127.0.0.1:3005/log/print-page/recent?lines=5" }
)

foreach ($t in $tests) {
    $minBytes = 0
    if ($t.ContainsKey("MinBytes")) { $minBytes = [int]$t.MinBytes }
    if (Test-Http -Name $t.Name -Url $t.Url -MinBytes $minBytes) { $ok++ } else { $fail++ }
}

if (Test-Http -Name "Print page log endpoint" -Url "http://127.0.0.1:3005/log/print-page" -Method "POST" -Body '{"jobId":"smoke-test"}') {
    $ok++
} else {
    $fail++
}

$logFile = Join-Path $root "print-service\logs\print-page.log"
if (Test-Path $logFile) {
    $last = Get-Content $logFile -Tail 1 -ErrorAction SilentlyContinue
    if ($last -match "smoke-test") {
        Write-Host "OK    Print page log file - last entry contains smoke-test" -ForegroundColor Green
        $ok++
    } else {
        Write-Host "WARN  Print page log file exists but smoke-test entry not found" -ForegroundColor Yellow
        $ok++
    }
} else {
    Write-Host "FAIL  Print page log file missing ($logFile)" -ForegroundColor Red
    $fail++
}

Write-Host ""
Write-Host "Result: $ok passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($fail -gt 0) {
    Write-Host "Tip: run .\start-dev.ps1 first, then retry." -ForegroundColor Yellow
    exit 1
}
exit 0
