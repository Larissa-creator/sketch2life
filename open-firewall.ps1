# Run once as Administrator (right-click PowerShell -> Run as administrator):
#   cd path\to\sketch-to-life
#   .\open-firewall.ps1

$rules = @(
    @{ Name = "Sketch2Life Frontend 5173"; Port = 5173 },
    @{ Name = "Sketch2Life Backend 8000"; Port = 8000 },
    @{ Name = "Sketch2Life Print 3005"; Port = 3005 }
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    Write-Host "ERROR: Run this script as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell -> Run as administrator, then:" -ForegroundColor Yellow
    Write-Host "  cd '$PSScriptRoot'" -ForegroundColor Yellow
    Write-Host "  .\open-firewall.ps1" -ForegroundColor Yellow
    exit 1
}

foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Enable-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue | Out-Null
        Write-Host "Firewall: port $($rule.Port) already allowed" -ForegroundColor DarkGreen
        continue
    }
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort $rule.Port -Profile Private, Domain, Public | Out-Null
    Write-Host "Firewall: port $($rule.Port) opened" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Restart .\start-dev.ps1 and connect phones to the QR URL." -ForegroundColor Cyan
