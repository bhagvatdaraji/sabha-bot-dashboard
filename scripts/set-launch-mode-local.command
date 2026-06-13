#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="$PROJECT_DIR/config/launcher.env"
REMOTE_DASHBOARD_URL="http://127.0.0.1:4000"

if [[ -f "$CONFIG_FILE" ]]; then
  source "$CONFIG_FILE"
fi

cat > "$CONFIG_FILE" <<EOF
MODE=local
REMOTE_DASHBOARD_URL=${REMOTE_DASHBOARD_URL}
EOF

printf 'Launcher mode set to LOCAL backup mode.\n'
