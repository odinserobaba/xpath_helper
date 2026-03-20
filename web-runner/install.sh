#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. Install Python 3 first."
  exit 1
fi

if [ ! -f ".venv/bin/activate" ]; then
  # If a previous venv creation was interrupted, ".venv" may exist without "bin/activate".
  rm -rf .venv
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

python -m pip install --upgrade pip
pip install -r requirements.txt

# Install browsers for Playwright
python -m playwright install chromium

# Flow Editor (локальный бандл React Flow, без CDN)
if command -v npm >/dev/null 2>&1; then
  echo "Building Flow Editor static bundle…"
  (cd flow-editor-src && npm ci && npm run build)
else
  echo "npm not found — skip Flow Editor build. Install Node.js or run: cd flow-editor-src && npm ci && npm run build"
fi

echo "OK. Now run: ./run.sh"
