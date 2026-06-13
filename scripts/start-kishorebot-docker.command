#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_DIR"
docker compose up -d --build

if command -v open >/dev/null 2>&1; then
  sleep 2
  open "http://localhost:4000"
fi

printf 'Kishore Sabha Coordinator is starting at http://localhost:4000\n'
