#!/bin/bash
# Daily update script — pulls latest code and rebuilds if anything changed.
# Registered automatically by setup.sh to run at 3am via cron.

set -e

# Load nvm so we use the correct Node version (cron doesn't source .bashrc)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "[$(date)] Checking for updates..."

git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "[$(date)] Already up to date. Nothing to do."
  exit 0
fi

echo "[$(date)] New commits found — pulling and rebuilding..."

git pull origin main

echo "[$(date)] Installing dependencies..."
npm install

echo "[$(date)] Building server and client..."
npm run build

echo "[$(date)] Restarting server..."
pm2 restart flight-tracker

echo "[$(date)] Update complete."
