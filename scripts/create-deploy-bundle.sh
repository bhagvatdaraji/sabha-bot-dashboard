#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
BUNDLE_ROOT="$PROJECT_DIR/dist/deploy-bundles"
STAGING_DIR="$BUNDLE_ROOT/kishorebot-deploy-$TIMESTAMP"
ARCHIVE_PATH="$BUNDLE_ROOT/kishorebot-deploy-$TIMESTAMP.tar.gz"

mkdir -p "$BUNDLE_ROOT"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

cd "$PROJECT_DIR"
npm run build

rsync -a \
  --exclude '.codex-tmp/' \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'client/node_modules/' \
  --exclude 'dist/' \
  --exclude 'logs/' \
  --exclude '.DS_Store' \
  ./ "$STAGING_DIR/"

tar -czf "$ARCHIVE_PATH" -C "$BUNDLE_ROOT" "$(basename "$STAGING_DIR")"

printf '\nDeployment bundle created:\n%s\n%s\n' "$STAGING_DIR" "$ARCHIVE_PATH"
