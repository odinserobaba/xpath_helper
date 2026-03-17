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

exec uvicorn app:app --reload --host "$HOST" --port "$PORT"
