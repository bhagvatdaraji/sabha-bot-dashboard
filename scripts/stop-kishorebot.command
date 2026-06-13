#!/bin/zsh

set -euo pipefail

PROJECT_DIR="/Users/bhagvatdaraji/Documents/KishoreBot"
PID_FILE="$PROJECT_DIR/logs/kishorebot.pid"

if [[ ! -f "$PID_FILE" ]]; then
  exit 0
fi

PID="$(cat "$PID_FILE")"
if [[ -n "${PID}" ]] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null || true
fi

pkill -f "/Users/bhagvatdaraji/Documents/KishoreBot/server/src/worker.js" 2>/dev/null || true
pkill -f "/Users/bhagvatdaraji/Documents/KishoreBot/server/src/server.js" 2>/dev/null || true
pkill -f "/Users/bhagvatdaraji/Documents/KishoreBot/client/node_modules/.bin/vite" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true

rm -f "$PID_FILE"
