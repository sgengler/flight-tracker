#!/bin/bash
# First-time setup for flight-tracker on a Raspberry Pi.
# Run once after cloning the repo:
#   bash scripts/setup.sh

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Installing Node.js (via NodeSource)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> Installing pm2..."
sudo npm install -g pm2

echo "==> Installing dependencies..."
npm install

echo "==> Building client..."
cd client && npm install && npm run build && cd ..

echo "==> Copying .env template (edit this before starting)..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    --> Edit .env and add your FLIGHTAWARE_API_KEY, then run: pm2 start npm --name flight-tracker -- start"
fi

echo "==> Registering update cron job (daily at 3am)..."
CRON_CMD="0 3 * * * $REPO_DIR/scripts/update.sh >> $REPO_DIR/logs/update.log 2>&1"
# Add only if not already present
( crontab -l 2>/dev/null | grep -qF "update.sh" ) \
  || ( crontab -l 2>/dev/null; echo "$CRON_CMD" ) | crontab -

mkdir -p "$REPO_DIR/logs"

echo ""
echo "==> Setup complete."
echo "    1. Edit .env and set FLIGHTAWARE_API_KEY"
echo "    2. Start the server:  pm2 start npm --name flight-tracker -- start"
echo "    3. Save pm2 state:    pm2 save"
echo "    4. Enable on boot:    pm2 startup  (then run the printed command)"
echo "    5. Set FullPageOS URL to: http://localhost:3001"
