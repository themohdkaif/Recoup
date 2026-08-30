#!/usr/bin/env bash
set -e

# Recoup: One-Command Concurrent Server Launcher
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "============================================================"
echo "               LAUNCHING RECOUP SERVERS                     "
echo "============================================================"

# Ensure venv exists
if [ ! -d "backend/venv" ]; then
  echo "Backend virtual environment not found. Please run ./setup.sh first."
  exit 1
fi

# Cleanup on exit / Ctrl+C
cleanup() {
  echo ""
  echo "Shutting down Recoup servers..."
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start FastAPI backend in background
echo "Starting FastAPI Backend on http://127.0.0.1:8000..."
./backend/venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

# Wait briefly for backend to initialize
sleep 1.5

# 2. Start Next.js frontend in foreground
echo "Starting Next.js Frontend on http://localhost:3000..."
echo "Press Ctrl+C to stop both servers."
echo ""
npm --prefix frontend run dev
