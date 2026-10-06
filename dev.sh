#!/usr/bin/env bash
# One-command dev refresh: pulls the latest code, installs any new
# dependencies, then starts the backend and the Electron dev app.
# Ctrl+C stops both. See CLAUDE.md "Electron desktop app > Development
# workflow" for what this automates.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ -n "$(git status --porcelain)" ]; then
  echo "==> Working tree has uncommitted changes — skipping 'git pull' so nothing gets overwritten."
  echo "    Commit or stash your changes and re-run this script to pick up the latest code."
else
  echo "==> Pulling latest '$BRANCH'..."
  git pull origin "$BRANCH"
fi

echo "==> Checking backend dependencies..."
if [ ! -d backend/.venv ]; then
  python3 -m venv backend/.venv
fi
backend/.venv/bin/pip install -q -r backend/requirements.txt

echo "==> Checking frontend dependencies..."
(cd frontend && npm install --no-fund --no-audit)

echo "==> Starting backend..."
(cd backend && .venv/bin/uvicorn main:app --reload) &
BACKEND_PID=$!

cleanup() {
  echo ""
  echo "==> Stopping backend..."
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Waiting for backend to come up..."
for _ in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:8000/; then break; fi
  sleep 0.5
done

echo "==> Starting frontend + Electron..."
cd frontend
npm run electron:dev
