# Shared helpers for Sketch2Life workshop scripts.

function Stop-PortListeners {
    param([int[]]$Ports)
    $self = $PID
    foreach ($port in $Ports) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            $processId = $conn.OwningProcess
            if ($processId -and $processId -ne 0 -and $processId -ne $self) {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Write-Host "Port $port freed (PID $processId stopped)" -ForegroundColor DarkYellow
            }
        }
    }
    Start-Sleep -Seconds 1
}

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

function Ensure-FirewallRules {
    param([string]$ProjectRoot = $PSScriptRoot)
    $script:FirewallFailed = $false
    $rules = @(
        @{ Name = "Sketch2Life Frontend 5173"; Port = 5173 },
        @{ Name = "Sketch2Life Backend 8000"; Port = 8000 },
        @{ Name = "Sketch2Life Print 3005"; Port = 3005 }
    )
    foreach ($rule in $rules) {
        $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        if ($existing) { continue }
        try {
            New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow `
                -Protocol TCP -LocalPort $rule.Port -Profile Private, Domain, Public -ErrorAction Stop | Out-Null
            Write-Host "Firewall: port $($rule.Port) allowed" -ForegroundColor DarkGreen
        } catch {
            Write-Host "Firewall: could not open port $($rule.Port) (admin required?)" -ForegroundColor Yellow
            $script:FirewallFailed = $true
        }
    }
    if ($script:FirewallFailed) {
        Write-Host ""
        Write-Host "Firewall fix: open PowerShell AS ADMINISTRATOR and run:" -ForegroundColor Yellow
        Write-Host "  cd '$ProjectRoot'" -ForegroundColor Yellow
        Write-Host "  .\open-firewall.ps1" -ForegroundColor Yellow
        Write-Host ""
    }
}

function Test-Sketch2LifeInstalled {
    param([string]$Root)
    $backendPy = Join-Path $Root "backend\.venv\Scripts\python.exe"
    $printPy = Join-Path $Root "print-service\.venv\Scripts\python.exe"
    $nodeModules = Join-Path $Root "frontend\node_modules"
    return @{
        Backend = Test-Path $backendPy
        Print = Test-Path $printPy
        Frontend = Test-Path $nodeModules
        Ok = (Test-Path $backendPy) -and (Test-Path $printPy) -and (Test-Path $nodeModules)
    }
}

function Get-BackendPython {
    param([string]$Root)
    $backend = Join-Path $Root "backend"
    $python = Join-Path $backend ".venv\Scripts\python.exe"
    if (-not (Test-Path $python)) {
        $python = Join-Path $backend "venv\Scripts\python.exe"
    }
    return $python
}

function Get-PrintPython {
    param([string]$Root)
    $printService = Join-Path $Root "print-service"
    $python = Join-Path $printService ".venv\Scripts\python.exe"
    if (-not (Test-Path $python)) {
        $python = Join-Path $printService "venv\Scripts\python.exe"
    }
    return $python
}
