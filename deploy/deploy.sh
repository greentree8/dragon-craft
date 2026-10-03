#!/usr/bin/env bash
# Publish the static game to the nginx web root. Usage: ./deploy/deploy.sh [target-dir]
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-/var/www/dragon}"
mkdir -p "$TARGET"
rsync -a --delete index.html style.css src vendor "$TARGET"/
echo "Deployed to $TARGET"
