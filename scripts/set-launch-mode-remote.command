#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="$PROJECT_DIR/config/launcher.env"
REMOTE_DASHBOARD_URL="${1:-}"

if [[ -z "$REMOTE_DASHBOARD_URL" && -f "$CONFIG_FILE" ]]; then
  source "$CONFIG_FILE"
fi

if [[ -z "${REMOTE_DASHBOARD_URL:-}" ]]; then
  printf 'Enter the remote dashboard URL (example: http://192.168.1.25:4000): '
  read -r REMOTE_DASHBOARD_URL
fi

cat > "$CONFIG_FILE" <<EOF
MODE=remote
REMOTE_DASHBOARD_URL=${REMOTE_DASHBOARD_URL}
EOF

if [[ -x "$PROJECT_DIR/scripts/stop-kishorebot.command" ]]; then
  "$PROJECT_DIR/scripts/stop-kishorebot.command" || true
fi

printf 'Launcher mode set to REMOTE mode.\nRemote dashboard: %s\n' "$REMOTE_DASHBOARD_URL"
