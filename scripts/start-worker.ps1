# Worker startup script for AWS EC2 deployment (Windows compatible for local dev)
Write-Host "🔄 Starting Sweep Pro Background Worker..." -ForegroundColor Cyan

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

# Default Redis to local if not provided
$env:REDIS_URL = if ($env:REDIS_URL) { $env:REDIS_URL } else { "redis://127.0.0.1:6379" }

Write-Host "⏳ Waiting for services to be ready (DB/Redis)..." -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host "🔧 Ensuring Prisma client is ready..." -ForegroundColor Gray
npx prisma generate 2>&1 | Out-Null

Write-Host "✅ Starting worker process (NODE_ENV=$env:NODE_ENV, TZ=$env:TZ)..." -ForegroundColor Green
npm run worker
