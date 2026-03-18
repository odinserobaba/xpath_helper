#!/usr/bin/env bash
set -euo pipefail

# Start Chromium-Gost with remote debugging enabled, so web-runner can attach via CDP.
# Usage:
#   ./run-chromium-gost-cdp.sh
#   CHROME_BIN=/opt/chromium-gost/chromium-gost CHROME_PROFILE=/home/me/.config/chromium CDP_PORT=9222 ./run-chromium-gost-cdp.sh

CHROME_BIN="${CHROME_BIN:-/opt/chromium-gost/chromium-gost}"
CHROME_PROFILE="${CHROME_PROFILE:-$HOME/.config/chromium}"
CDP_PORT="${CDP_PORT:-9222}"
EXTRA_FLAGS="${EXTRA_FLAGS:-}"

if [ ! -x "$CHROME_BIN" ]; then
  echo "Chromium executable not found or not executable: $CHROME_BIN"
  echo "Set CHROME_BIN=/path/to/chromium-gost"
  exit 1
fi

echo "Starting Chromium-Gost (CDP port: $CDP_PORT)"
echo "Profile: $CHROME_PROFILE"
echo "Binary:  $CHROME_BIN"
echo
echo "In Web Runner UI enable: Attach (CDP) and set endpoint/port to: $CDP_PORT"
echo

exec "$CHROME_BIN" \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$CHROME_PROFILE" \
  $EXTRA_FLAGS

