#!/bin/zsh

set -euo pipefail

PROJECT_DIR="/Users/bhagvatdaraji/Documents/KishoreBot"
CONFIG_FILE="$PROJECT_DIR/config/launcher.env"
APP_MODE="local"
REMOTE_DASHBOARD_URL="http://127.0.0.1:4000"
LOCAL_APP_URL="http://127.0.0.1:5173"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/kishorebot.log"
PID_FILE="$LOG_DIR/kishorebot.pid"
STOP_SCRIPT="$PROJECT_DIR/scripts/stop-kishorebot.command"

if [[ -f "$CONFIG_FILE" ]]; then
  source "$CONFIG_FILE"
  APP_MODE="${MODE:-$APP_MODE}"
  REMOTE_DASHBOARD_URL="${REMOTE_DASHBOARD_URL:-$REMOTE_DASHBOARD_URL}"
fi

mkdir -p "$LOG_DIR"

if [[ "$APP_MODE" == "remote" ]]; then
  if [[ -x "$STOP_SCRIPT" ]]; then
    "$STOP_SCRIPT" || true
  fi
  open "$REMOTE_DASHBOARD_URL"
  exit 0
fi

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if [[ -n "${EXISTING_PID}" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    open "$LOCAL_APP_URL"
    exit 0
  fi
fi

cd "$PROJECT_DIR"

nohup npm run dev >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 4
open "$LOCAL_APP_URL"
