# PowerShell version of run-cron.sh for local Windows development
# Usage:
#   .\scripts\run-cron.ps1 assignment
#   .\scripts\run-cron.ps1 expired
#   .\scripts\run-cron.ps1 subscriptions

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet('assignment', 'expired', 'subscriptions')]
    [string]$Task
)

# Move to backend root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $ScriptDir "..")

# Load .env if present
if (Test-Path .env) {
    Write-Host "📋 Loading environment from .env..." -ForegroundColor Gray
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*?)\s*=\s*(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

# Force production runtime and UTC
$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { "production" }
$env:TZ = if ($env:TZ) { $env:TZ } else { "UTC" }
$env:REDIS_URL = if ($env:REDIS_URL) { $env:REDIS_URL } else { "redis://127.0.0.1:6379" }

switch ($Task) {
    'assignment' {
        Write-Host "▶ Running cron:assignment (UTC)" -ForegroundColor Cyan
        npm run cron:assignment
    }
    'expired' {
        Write-Host "▶ Running cron:expired (UTC)" -ForegroundColor Cyan
        npm run cron:expired
    }
    'subscriptions' {
        Write-Host "▶ Running cron:subscriptions (UTC)" -ForegroundColor Cyan
        npm run cron:subscriptions
    }
}
