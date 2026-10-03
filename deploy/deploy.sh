#!/usr/bin/env bash
# Publish the static game to the nginx web root. Usage: ./deploy/deploy.sh [target-dir]
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-/var/www/dragon}"
mkdir -p "$TARGET"
# plain cp so it works without rsync; clear the old copies first so removed files don't linger
rm -rf "$TARGET"/src "$TARGET"/vendor
cp -r index.html style.css src vendor "$TARGET"/
echo "Deployed to $TARGET"
