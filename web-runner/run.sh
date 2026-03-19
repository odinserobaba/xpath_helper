#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "Virtualenv .venv not found. Run: ./install.sh"
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

START_CDP_BROWSER="${START_CDP_BROWSER:-1}"
CHROME_OUTPUT="${CHROME_OUTPUT:-stdout}" # stdout | file
CHROME_LOG_FILE="${CHROME_LOG_FILE:-/tmp/xpath-helper-chromium-gost.log}"
CDP_PORT="${CDP_PORT:-9222}"
KILL_EXISTING_CHROME_FOR_CDP="${KILL_EXISTING_CHROME_FOR_CDP:-0}" # 0|1

wait_for_cdp() {
  local url="http://127.0.0.1:${CDP_PORT}/json/version"
  local deadline=$((SECONDS + 15))
  while [ $SECONDS -lt $deadline ]; do
    if python3 - <<PY >/dev/null 2>&1
import urllib.request
urllib.request.urlopen("${url}", timeout=1).read(32)
PY
    then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

maybe_kill_existing_chrome() {
  # If Chromium is already running without CDP, starting with the same profile won't enable CDP.
  # Opt-in kill to restart with --remote-debugging-port.
  if [ "$KILL_EXISTING_CHROME_FOR_CDP" != "1" ]; then
    return 0
  fi
  echo "KILL_EXISTING_CHROME_FOR_CDP=1 → stopping existing Chromium-Gost instances…"
  pkill -f "/opt/chromium-gost/chrome" >/dev/null 2>&1 || true
  pkill -f "/opt/chromium-gost/chromium-gost" >/dev/null 2>&1 || true
  sleep 1
}

if [ "$START_CDP_BROWSER" = "1" ]; then
  echo "Starting Chromium-Gost with CDP first…"
  echo "Tip: set START_CDP_BROWSER=0 to skip browser start."
  echo "Chrome output: CHROME_OUTPUT=$CHROME_OUTPUT (stdout|file)"
  echo "CDP port: $CDP_PORT"
  echo "Auto-kill existing Chromium (opt-in): KILL_EXISTING_CHROME_FOR_CDP=$KILL_EXISTING_CHROME_FOR_CDP"
  echo

  if wait_for_cdp; then
    echo "CDP already available on 127.0.0.1:$CDP_PORT"
  else
    maybe_kill_existing_chrome
  fi

  # Run browser in background. Keep PID so we can stop it when runner exits.
  if [ "$CHROME_OUTPUT" = "file" ]; then
    CDP_PORT="$CDP_PORT" ./run-chromium-gost-cdp.sh >"$CHROME_LOG_FILE" 2>&1 &
    echo "Chromium log: $CHROME_LOG_FILE"
  else
    # Show Chromium output in this terminal (may interleave with uvicorn logs)
    CDP_PORT="$CDP_PORT" ./run-chromium-gost-cdp.sh 2>&1 | tee "$CHROME_LOG_FILE" &
    echo "Chromium log (tee): $CHROME_LOG_FILE"
  fi
  CHROME_PID="$!"
  echo "Chromium-Gost PID: $CHROME_PID"
  echo

  echo "Waiting for CDP endpoint…"
  if ! wait_for_cdp; then
    echo "ERROR: CDP endpoint is not available on 127.0.0.1:$CDP_PORT"
    echo "Hints:"
    echo " - If Chromium is already open without CDP, restart it with --remote-debugging-port."
    echo " - Or run with: KILL_EXISTING_CHROME_FOR_CDP=1 ./run.sh (will close existing Chromium-Gost)."
    echo " - Check log: $CHROME_LOG_FILE"
    exit 1
  fi

  cleanup() {
    if kill -0 "$CHROME_PID" >/dev/null 2>&1; then
      echo "Stopping Chromium-Gost (PID $CHROME_PID)…"
      kill "$CHROME_PID" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT INT TERM
fi

echo "Web Runner: http://$HOST:$PORT"
echo "UI: enable Attach (CDP) and set endpoint/port (default 9222)."
echo

uvicorn app:app --reload --host "$HOST" --port "$PORT"
