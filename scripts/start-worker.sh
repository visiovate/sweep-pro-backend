#!/usr/bin/env bash
set -euo pipefail

# Worker startup script for AWS EC2 deployment (compatible locally)
echo "🔄 Starting Sweep Pro Background Worker..."

# Move to backend root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Export env vars from .env if present
if [ -f .env ]; then
	set -a
	# shellcheck disable=SC1091
	. ./.env
	set +a
fi

# Force production runtime and UTC
export NODE_ENV="${NODE_ENV:-production}"
export TZ="${TZ:-UTC}"

# Default Redis to local if not provided
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"

echo "⏳ Waiting for services to be ready (DB/Redis)..."
sleep 5

echo "🔧 Ensuring Prisma client is ready..."
npx prisma generate >/dev/null 2>&1 || true

echo "✅ Starting background worker (NODE_ENV=$NODE_ENV, TZ=$TZ)..."
npm run worker