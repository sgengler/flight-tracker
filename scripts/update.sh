#!/bin/bash
# Update script — pulls latest code and installs a matching build if anything changed.
# Run by the server's hourly updater / "Check for Updates" button, and by cron at 3am.
#
# Builds are normally downloaded prebuilt from the `pi-build` GitHub release
# (.github/workflows/pi-build.yml) so the Pi doesn't compile while the kiosk is
# running. If that build isn't available within BUILD_WAIT_S, it falls back to
# building locally at the lowest CPU/IO priority.
#
# Everything runs inside main() so bash parses the whole file up front; after
# `git pull` the script re-execs the freshly pulled copy of itself.

set -e

BUILD_URL="https://github.com/sgengler/flight-tracker/releases/download/pi-build/pi-build.tar.gz"
BUILD_WAIT_S=300   # CI usually finishes in ~2 min
BUILD_POLL_S=20

log() { echo "[$(date)] $*"; }

load_node() {
  # Load nvm so we use the correct Node version (cron doesn't source .bashrc).
  # Unset npm_config_prefix first — pm2 inherits it from the system npm and
  # nvm refuses to load when it's set.
  unset npm_config_prefix
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
}

deployed_sha() { cat .build-sha 2>/dev/null || true; }

install_deps_if_changed() {
  local prev="$1"
  if [ -n "$prev" ] && git diff --quiet "$prev" HEAD -- package-lock.json; then
    log "Dependencies unchanged — skipping npm install."
    return
  fi
  log "Installing dependencies..."
  local sqlite_before sqlite_after
  sqlite_before=$(git show "${prev:-HEAD~1}":package-lock.json 2>/dev/null | grep -A1 '"node_modules/better-sqlite3"' | grep '"version"' | head -1)
  nice -n 19 npm install
  sqlite_after=$(grep -A1 '"node_modules/better-sqlite3"' package-lock.json | grep '"version"' | head -1)
  if [ "$sqlite_before" != "$sqlite_after" ]; then
    log "better-sqlite3 version changed — rebuilding native module..."
    nice -n 19 npm rebuild better-sqlite3 || log "WARNING: better-sqlite3 rebuild failed — keeping existing binary"
  fi
}

# Downloads the CI build for HEAD, waiting for CI if needed. Returns non-zero if
# no matching build turned up in time.
fetch_prebuilt() {
  local want tmp waited=0
  want=$(git rev-parse HEAD)
  tmp=$(mktemp -d)
  while true; do
    if curl -fsSL --max-time 120 -o "$tmp/build.tar.gz" "$BUILD_URL" \
      && tar -xzf "$tmp/build.tar.gz" -C "$tmp" BUILD_SHA 2>/dev/null \
      && [ "$(cat "$tmp/BUILD_SHA")" = "$want" ]; then
      break
    fi
    if [ "$waited" -ge "$BUILD_WAIT_S" ]; then
      log "No prebuilt build for ${want:0:7} after ${BUILD_WAIT_S}s."
      rm -rf "$tmp"
      return 1
    fi
    log "Prebuilt build for ${want:0:7} not ready yet — waiting..."
    sleep "$BUILD_POLL_S"
    waited=$((waited + BUILD_POLL_S))
  done

  log "Installing prebuilt build ${want:0:7}..."
  tar -xzf "$tmp/build.tar.gz" -C "$tmp"
  rm -rf client/dist server/dist
  mv "$tmp/client/dist" client/dist
  mv "$tmp/server/dist" server/dist
  rm -rf "$tmp"
}

build_locally() {
  log "Building locally at low priority..."
  nice -n 19 ionice -c3 npm run build -w client
  nice -n 19 ionice -c3 npm run build -w server
}

main() {
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$REPO_DIR"
  load_node

  if [ "$1" != "--after-pull" ]; then
    log "Checking for updates..."
    git fetch origin main
    local local_sha remote_sha
    local_sha=$(git rev-parse HEAD)
    remote_sha=$(git rev-parse origin/main)

    if [ "$local_sha" = "$remote_sha" ] && [ "$(deployed_sha)" = "$local_sha" ]; then
      log "Already up to date. Nothing to do."
      exit 0
    fi

    if [ "$local_sha" != "$remote_sha" ]; then
      log "New commits found — pulling..."
      git pull origin main
    else
      log "Code is current but the installed build isn't — reinstalling build..."
    fi
    # Continue with the freshly pulled copy of this script
    exec bash "$REPO_DIR/scripts/update.sh" --after-pull "$local_sha"
  fi

  local prev="$2"
  install_deps_if_changed "$prev"
  fetch_prebuilt || build_locally
  git rev-parse HEAD > .build-sha

  log "Restarting server..."
  pm2 restart flight-tracker

  log "Update complete."
}

main "$@"
