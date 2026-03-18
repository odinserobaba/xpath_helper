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

if [ "$START_CDP_BROWSER" = "1" ]; then
  echo "Starting Chromium-Gost with CDP first…"
  echo "Tip: set START_CDP_BROWSER=0 to skip browser start."
  echo "Chrome output: CHROME_OUTPUT=$CHROME_OUTPUT (stdout|file)"
  echo
  # Run browser in background. Keep PID so we can stop it when runner exits.
  if [ "$CHROME_OUTPUT" = "file" ]; then
    ./run-chromium-gost-cdp.sh >"$CHROME_LOG_FILE" 2>&1 &
    echo "Chromium log: $CHROME_LOG_FILE"
  else
    # Show Chromium output in this terminal (may interleave with uvicorn logs)
    ./run-chromium-gost-cdp.sh 2>&1 | tee "$CHROME_LOG_FILE" &
    echo "Chromium log (tee): $CHROME_LOG_FILE"
  fi
  CHROME_PID="$!"
  echo "Chromium-Gost PID: $CHROME_PID"
  echo
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
