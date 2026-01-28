#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/run-cron.sh assignment
#   ./scripts/run-cron.sh expired
#   ./scripts/run-cron.sh subscriptions

TASK="${1:-}"
if [ -z "$TASK" ]; then
  echo "Usage: $0 <assignment|expired|subscriptions>"
  exit 2
fi

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
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"

case "$TASK" in
  assignment)
    echo "▶ Running cron:assignment (UTC)";
    npm run cron:assignment
    ;;
  expired)
    echo "▶ Running cron:expired (UTC)";
    npm run cron:expired
    ;;
  subscriptions)
    echo "▶ Running cron:subscriptions (UTC)";
    npm run cron:subscriptions
    ;;
  *)
    echo "Unknown task: $TASK";
    exit 3
    ;;
esac

echo "✔ Cron task '$TASK' completed."