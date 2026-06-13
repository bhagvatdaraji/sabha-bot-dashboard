#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_DIR"
docker compose down

printf 'Kishore Sabha Coordinator has been stopped.\n'
