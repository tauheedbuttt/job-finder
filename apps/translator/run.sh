#!/usr/bin/env bash
# Usage: ./run.sh [test]. Creates venv if missing, syncs requirements, then serves or tests.
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
sum=$(cat requirements.txt requirements-dev.txt | shasum | cut -c1-40)
if [ "$(cat .venv/.stamp 2>/dev/null)" != "$sum" ]; then
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements-dev.txt
  echo "$sum" > .venv/.stamp
fi
if [ "${1:-}" = "test" ]; then
  exec .venv/bin/python -m pytest -q tests
fi
exec .venv/bin/python translate_server.py
