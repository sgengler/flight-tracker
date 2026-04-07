#!/bin/bash
# First-time setup for flight-tracker on a Raspberry Pi.
# Run once after cloning the repo:
#   bash scripts/setup.sh

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Installing Node.js LTS via nvm..."
# nvm works on all architectures including armhf (32-bit Pi OS)
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
# Load nvm into this shell session
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts
nvm alias default node

echo "==> Installing pm2..."
# Install without sudo so pm2 uses nvm's node (avoids system Node mismatch at boot)
npm install -g pm2

echo "==> Installing dependencies..."
npm install

echo "==> Building server and client..."
# Root-level build compiles TypeScript server (-> server/dist/) and Vite client (-> client/dist/)
npm run build

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
echo "==> Configuring pm2 to start on boot..."
# pm2 startup prints a command that must be run as root — capture and execute it
PM2_STARTUP_CMD=$(pm2 startup systemd 2>&1 | grep "sudo env" | tr -d '\n')
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
  echo "    pm2 startup configured."
else
  echo "    Could not auto-configure pm2 startup — run 'pm2 startup' manually."
fi

echo ""
echo "==> Setup complete."
echo "    1. Edit .env and set FLIGHTAWARE_API_KEY"
echo "    2. Start the server:  pm2 start npm --name flight-tracker -- start"
echo "    3. Run:               pm2 save"
echo "    4. Set FullPageOS URL to: http://localhost:3001"
